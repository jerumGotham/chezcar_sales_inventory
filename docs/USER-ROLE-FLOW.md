# User and Role Flow

Public sign-up is disabled. The guarded development seed creates the immutable owner account and role; production still needs a dedicated first-owner provisioning operation.

## Roles

Open `/users/roles` with `roles:view`. Creating and editing require `roles:create` and `roles:update` respectively.

Roles contain action permissions only. Permissions are grouped by module and can be selected independently. Administration permissions can be delegated to custom roles. Owner may grant any catalog action; delegated role managers can create only roles within their effective actions and may update a role only when both its current and requested actions remain within that ceiling. They cannot edit their own assigned role. `locations:all` is labeled **Access all locations** and grants location reach only, never another action.

The one role with `isOwner: true` is immutable, nonassignable, and receives the complete capability catalog. No request can create another owner role or owner user. Permission changes revoke every assigned user's sessions. Removing `locations:all` is rejected while any assigned user lacks at least one active operational `UserLocation` assignment.

## Locations

The seeded Stock Room (`SR`) and active branches are assignable. A user may have one or more assignments, for example QC and LU, or QC and Stock Room.

- Owner and `locations:all` roles can access every active operational location; no assignment is required.
- Other roles require at least one active operational assignment and fail closed when none remains.
- Reads are filtered to assigned locations. Mutations validate their explicit resource or target location.
- Delegated user managers must cover every active operational assignment of a target; one overlapping branch is insufficient. Targets with `locations:all` require an all-location manager.
- Editing, changing status, and resetting a password also require the target's current effective role capabilities to fit within the delegated manager's capabilities. The service revalidates the locked user and role for every mutation; owner bypasses these delegation ceilings.
- A selected role with `locations:all` hides the user form's location selector and explains why locations are optional.

## Users

Open `/users` with `users:view`. The create, edit, status, and password actions each require their exact `users:*` capability. Delegated managers can see and manage only users within their effective location access; filters and summary counts cannot widen that scope. Forms expose only assignable locations and roles. Delegated managers cannot grant capabilities or location reach they do not hold, and cannot change their own role, locations, status, or password through User Management.

Create requests contain `roleId`, `name`, `email`, `temporaryPassword`, and `locationIds`. Update requests may replace `locationIds`. Role/location replacement and session deletion commit in one Prisma transaction. Access changes, status changes, role permission changes, and password resets revoke sessions.

The owner user is visible but immutable. User Management cannot assign the owner role or create another owner.

## First Sign-In

The staff member signs in at `/sign-in` with the temporary password. **Change Password** replaces it, keeps the current session, and revokes other sessions. **Skip for Now** consumes the prompt without claiming the password changed. A later delegated password reset re-arms the prompt.

## Compatibility

`User.role`, `User.locationId`, and `RoleDefinition.scope` remain temporarily because Better Auth and additive database history still expose them. Lifecycle writes keep the User fields populated where practical, but no authorization, query filter, menu, page gate, notification recipient selection, POS/offline decision, or mutation validation depends on these compatibility values. `RoleDefinition.isOwner`, `RoleDefinition.permissions`, and `UserLocation` are authoritative.

The menu is presentation only. Protected pages and APIs reload active persisted access on every request; missing capabilities or an empty restricted assignment return `403` without protected data.
