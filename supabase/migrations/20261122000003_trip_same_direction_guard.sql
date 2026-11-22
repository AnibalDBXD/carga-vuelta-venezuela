-- Un camión no puede tener dos viajes en el mismo sentido el mismo día.
-- Se aplica como trigger (no como índice único) para no fallar sobre datos
-- históricos que todavía tengan duplicados: bloquea solo las escrituras nuevas.
create or replace function public.trips_block_same_direction()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.trips t
    where t.vehicle_id = new.vehicle_id
      and t.departure_date = new.departure_date
      and t.origin = new.origin
      and t.destination = new.destination
      and t.id is distinct from new.id
  ) then
    raise exception 'Ya existe un viaje % → % para ese camión el día %',
      new.origin, new.destination, new.departure_date
      using errcode = '23505',
            hint = 'Cambia la fecha o usa el sentido contrario del recorrido.';
  end if;
  return new;
end;
$$;

drop trigger if exists trips_block_same_direction on public.trips;

create trigger trips_block_same_direction
before insert or update of vehicle_id, departure_date, origin, destination
on public.trips
for each row
execute function public.trips_block_same_direction();
