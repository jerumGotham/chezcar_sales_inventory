UPDATE "Location"
SET "name" = CASE "code"
  WHEN 'QC' THEN 'Quezon City'
  WHEN 'BL' THEN 'Biñan Laguna'
  WHEN 'LU' THEN 'La Union'
  WHEN 'VC' THEN 'Vigan City'
  WHEN 'SP' THEN 'San Fernando Pampanga'
  WHEN 'SR' THEN 'Stock Room'
END,
"updatedAt" = CURRENT_TIMESTAMP
WHERE ("type" = 'BRANCH' AND "code" IN ('QC', 'BL', 'LU', 'VC', 'SP'))
   OR ("type" = 'WAREHOUSE' AND "code" = 'SR');
