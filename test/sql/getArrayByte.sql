--* return table
select get_byte(unnest($1::bytea[]), 0) as byte

