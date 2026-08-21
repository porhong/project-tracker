-- Keep the existing activity IDs so all sprint allocations retain their
-- history while presenting the shortened client-facing labels.
update public.activity_types
set name = case name
  when 'Meetings / Admin' then 'Meeting'
  when 'Support / Incidents' then 'Support'
end
where name in ('Meetings / Admin', 'Support / Incidents');
