-- Run after importing CSV rows with explicit IDs. PostgreSQL identity sequences
-- do not automatically advance when an import supplies the ID column.

select setval(
    pg_get_serial_sequence('public.nu_users', 'id'),
    greatest(coalesce(max(id), 1), 1),
    max(id) is not null
) from public.nu_users;

select setval(
    pg_get_serial_sequence('public.nu_buildings', 'id'),
    greatest(coalesce(max(id), 1), 1),
    max(id) is not null
) from public.nu_buildings;

select setval(
    pg_get_serial_sequence('public.nu_departments', 'id'),
    greatest(coalesce(max(id), 1), 1),
    max(id) is not null
) from public.nu_departments;

select setval(
    pg_get_serial_sequence('public.nu_floors', 'id'),
    greatest(coalesce(max(id), 1), 1),
    max(id) is not null
) from public.nu_floors;

select setval(
    pg_get_serial_sequence('public.nu_rooms', 'id'),
    greatest(coalesce(max(id), 1), 1),
    max(id) is not null
) from public.nu_rooms;

select setval(
    pg_get_serial_sequence('public.nu_places', 'id'),
    greatest(coalesce(max(id), 1), 1),
    max(id) is not null
) from public.nu_places;

select setval(
    pg_get_serial_sequence('public.nu_events', 'id'),
    greatest(coalesce(max(id), 1), 1),
    max(id) is not null
) from public.nu_events;

select setval(
    pg_get_serial_sequence('public.nu_event_sessions', 'id'),
    greatest(coalesce(max(id), 1), 1),
    max(id) is not null
) from public.nu_event_sessions;

select setval(
    pg_get_serial_sequence('public.nu_event_attendees', 'id'),
    greatest(coalesce(max(id), 1), 1),
    max(id) is not null
) from public.nu_event_attendees;

select setval(
    pg_get_serial_sequence('public.nu_event_attendees_log', 'id'),
    greatest(coalesce(max(id), 1), 1),
    max(id) is not null
) from public.nu_event_attendees_log;

select setval(
    pg_get_serial_sequence('public.nu_event_question', 'id'),
    greatest(coalesce(max(id), 1), 1),
    max(id) is not null
) from public.nu_event_question;

select setval(
    pg_get_serial_sequence('public.nu_user_note', 'id'),
    greatest(coalesce(max(id), 1), 1),
    max(id) is not null
) from public.nu_user_note;
