type AuthOriginEnvironment = {
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
};

export function resolveAuthTrustedOrigins(
  environment: AuthOriginEnvironment,
): string[] {
  return [
    environment.BETTER_AUTH_URL,
    ...(environment.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? []),
  ].reduce<string[]>((origins, value) => {
    const origin = value?.trim();
    if (origin && !origins.includes(origin)) origins.push(origin);
    return origins;
  }, []);
}
