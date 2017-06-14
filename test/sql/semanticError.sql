--* return value
SELECT num AS nummm
FROM _database_test x
JOIN (
  SELECT *
  FROM _database_test y
  WHERE x.num = y.num
) AS z ON true
