-- Reserva tarefas somente da busca pertencente ao usuário solicitado pelo worker interativo.
CREATE OR REPLACE FUNCTION public.reservar_tarefas_da_busca(
  _tipo text,
  _limite int,
  _user_id uuid,
  _busca_id uuid
)
RETURNS SETOF public.tarefas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tarefas t
     SET status = 'pendente', reservado_em = NULL
   WHERE t.user_id = _user_id
     AND t.status = 'em_processamento'
     AND t.reservado_em < now() - interval '5 minutes'
     AND EXISTS (
       SELECT 1 FROM public.leads l
        JOIN public.buscas b ON b.id = l.busca_id
        WHERE l.id = t.lead_id
          AND l.user_id = _user_id
          AND l.busca_id = _busca_id
          AND b.user_id = _user_id
          AND b.status NOT IN ('pausada', 'cancelada', 'erro')
     );

  RETURN QUERY
  UPDATE public.tarefas t
     SET status = 'em_processamento', reservado_em = now(), tentativas = t.tentativas + 1
   WHERE t.id IN (
     SELECT t2.id
       FROM public.tarefas t2
       JOIN public.leads l ON l.id = t2.lead_id
       JOIN public.buscas b ON b.id = l.busca_id
      WHERE t2.user_id = _user_id
        AND t2.tipo = _tipo
        AND t2.status = 'pendente'
        AND t2.executar_apos <= now()
        AND l.user_id = _user_id
        AND l.busca_id = _busca_id
        AND b.user_id = _user_id
        AND b.status NOT IN ('pausada', 'cancelada', 'erro')
      ORDER BY t2.executar_apos
      LIMIT _limite
      FOR UPDATE OF t2 SKIP LOCKED
   )
  RETURNING t.*;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_tarefas_da_busca(text, int, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_tarefas_da_busca(text, int, uuid, uuid) TO service_role;
