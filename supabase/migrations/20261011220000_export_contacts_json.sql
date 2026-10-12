-- ============================================================================
-- MailDesk — Contact export performance fix (0007)
-- The original export_contacts aggregated rows with jsonb_agg, which took ~14s
-- for a 50k-row export and blew the authenticated role's 8s statement_timeout.
-- json_agg builds the same payload ~6x faster. Return type changes jsonb -> json
-- so the aggregate is embedded without a re-parse, and the statement timeout is
-- raised locally as a safety net for filtered exports.
-- ============================================================================

drop function if exists public.export_contacts(text, text, boolean, int);

create or replace function public.export_contacts(
  p_query     text    default null,
  p_status    text    default null,
  p_has_email boolean default true,
  p_limit     int     default 20000
) returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_where text := ' where true';
  v_limit int  := greatest(1, least(coalesce(p_limit, 20000), 50000));
  v_rows  json;
  v_total bigint;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  set local statement_timeout = '30s';

  if p_has_email then
    v_where := v_where || ' and l.email is not null';
  end if;
  if p_status is not null and p_status <> '' then
    v_where := v_where || format(' and l.contact_status = %L', p_status);
  end if;
  if p_query is not null and btrim(p_query) <> '' then
    v_where := v_where || format(
      ' and (l.legal_name ilike %L or l.email ilike %L or l.contact_name ilike %L)',
      '%' || p_query || '%', '%' || p_query || '%', '%' || p_query || '%');
  end if;

  execute 'select count(*) from public.leads l' || v_where into v_total;

  execute
    'select coalesce(json_agg(t), ''[]''::json) from ('
      || 'select l.id, l.legal_name, l.dba_name, l.contact_name, l.email, l.phone, '
      || 'l.cell_phone, l.officer_title, l.website, l.address, l.city, l.state, l.zip, '
      || 'l.tags, l.source, l.notes, l.contact_status, l.last_reply_at, l.created_at '
      || 'from public.leads l' || v_where
      || ' order by l.last_reply_at desc nulls last limit '
      || v_limit
    || ') t'
  into v_rows;

  return json_build_object('rows', coalesce(v_rows, '[]'::json), 'total', v_total,
                           'limit', v_limit, 'truncated', v_total > v_limit);
end;
$$;

revoke execute on function public.export_contacts(text,text,boolean,int) from public, anon;
grant execute on function public.export_contacts(text,text,boolean,int) to authenticated;
