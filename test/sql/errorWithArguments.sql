--* return row
select $1, $2, $3, num as nummm
from _database_test x
join (
  select *
  from _database_test y
  where x.num = y.num
) as z on true
