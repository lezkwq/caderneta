CREATE TABLE public.app_config (
  chave text PRIMARY KEY,
  valor jsonb NOT NULL,
  descricao text
);
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
INSERT INTO public.app_config (chave, valor, descricao) VALUES
 ('maps_actor_id', '"compass~crawler-google-places"', 'Actor do Apify para Google Maps (use ~ no lugar da /)'),
 ('search_actor_id', '"apify~google-search-scraper"', 'Actor do Apify para busca "nome + cidade + CNPJ"'),
 ('busca_cnpj_google', 'false', 'Liga a busca opcional de CNPJ no Google (gasta créditos do Apify)'),
 ('max_charge_usd', '1.0', 'Teto de gasto por execução do Apify em dólares'),
 ('buscas_por_dia', '10', 'Máximo de buscas por usuário por dia'),
 ('cnpj_intervalo_seg', '21', 'Intervalo mínimo entre consultas de CNPJ');

CREATE TABLE public.buscas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('maps','manual')),
  titulo text NOT NULL,
  cidade text, estado text, pais text, nicho text,
  quantidade int,
  status text NOT NULL DEFAULT 'iniciando',
  apify_run_id text,
  apify_dataset_id text,
  erro text,
  total_leads int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX buscas_user_idx ON public.buscas(user_id, created_at DESC);
GRANT SELECT, DELETE ON public.buscas TO authenticated;
GRANT ALL ON public.buscas TO service_role;
ALTER TABLE public.buscas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver proprias buscas" ON public.buscas FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "excluir proprias buscas" ON public.buscas FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  busca_id uuid NOT NULL REFERENCES public.buscas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  pessoa text,
  categoria text,
  endereco text, logradouro text, cidade text, uf text, cep text,
  place_id text,
  maps_url text,
  site text,
  links jsonb NOT NULL DEFAULT '[]',
  cnpj text,
  cnpj_origem text,
  cnpj_fonte_url text,
  cnpj_status text NOT NULL DEFAULT 'pendente',
  cnpj_motivo text,
  razao_social text,
  nome_fantasia text,
  situacao text,
  natureza text,
  municipio_receita text,
  uf_receita text,
  dono text,
  dono_fonte text,
  socios jsonb NOT NULL DEFAULT '[]',
  email_receita text,
  status text NOT NULL DEFAULT 'na_fila',
  contatado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_busca_idx ON public.leads(busca_id);
CREATE INDEX leads_user_cnpj_idx ON public.leads(user_id, cnpj);
GRANT SELECT, DELETE ON public.leads TO authenticated;
GRANT UPDATE (contatado) ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver proprios leads" ON public.leads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "marcar proprios leads" ON public.leads FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "excluir proprios leads" ON public.leads FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.telefones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  numero text NOT NULL,
  tipo text NOT NULL,
  fontes jsonb NOT NULL DEFAULT '[]',
  score int NOT NULL DEFAULT 0,
  motivos jsonb NOT NULL DEFAULT '[]',
  principal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, numero)
);
CREATE INDEX telefones_user_num_idx ON public.telefones(user_id, numero);
GRANT SELECT ON public.telefones TO authenticated;
GRANT ALL ON public.telefones TO service_role;
ALTER TABLE public.telefones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver proprios telefones" ON public.telefones FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('site','cnpj','busca_cnpj')),
  status text NOT NULL DEFAULT 'pendente',
  tentativas int NOT NULL DEFAULT 0,
  executar_apos timestamptz NOT NULL DEFAULT now(),
  reservado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tarefas_fila_idx ON public.tarefas(tipo, status, executar_apos);
GRANT ALL ON public.tarefas TO service_role;
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cnpj_cache (
  cnpj text PRIMARY KEY,
  fonte text NOT NULL,
  dados jsonb NOT NULL,
  consultado_em timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.cnpj_cache TO service_role;
ALTER TABLE public.cnpj_cache ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.api_estado (
  chave text PRIMARY KEY,
  ultima_consulta timestamptz,
  bloqueado_ate timestamptz
);
GRANT ALL ON public.api_estado TO service_role;
ALTER TABLE public.api_estado ENABLE ROW LEVEL SECURITY;
INSERT INTO public.api_estado (chave) VALUES ('cnpj');

-- Reserva atômica de tarefas: duas chamadas simultâneas nunca pegam o mesmo item.
CREATE OR REPLACE FUNCTION public.reservar_tarefas(_tipo text, _limite int)
RETURNS SETOF public.tarefas LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- devolve à fila itens travados há mais de 5 min
  UPDATE public.tarefas SET status = 'pendente', reservado_em = NULL
   WHERE status = 'em_processamento' AND reservado_em < now() - interval '5 minutes';
  RETURN QUERY
  UPDATE public.tarefas t SET status = 'em_processamento', reservado_em = now(), tentativas = t.tentativas + 1
   WHERE t.id IN (
     SELECT id FROM public.tarefas
      WHERE tipo = _tipo AND status = 'pendente' AND executar_apos <= now()
      ORDER BY executar_apos
      LIMIT _limite
      FOR UPDATE SKIP LOCKED)
  RETURNING t.*;
END $$;
REVOKE ALL ON FUNCTION public.reservar_tarefas(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_tarefas(text, int) TO service_role;

-- Reserva atômica do "slot" da API de CNPJ (1 consulta por intervalo, respeita bloqueio).
CREATE OR REPLACE FUNCTION public.reservar_slot_cnpj(_intervalo_seg int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean;
BEGIN
  UPDATE public.api_estado SET ultima_consulta = now()
   WHERE chave = 'cnpj'
     AND (bloqueado_ate IS NULL OR bloqueado_ate < now())
     AND (ultima_consulta IS NULL OR ultima_consulta < now() - make_interval(secs => _intervalo_seg))
  RETURNING true INTO ok;
  RETURN coalesce(ok, false);
END $$;
REVOKE ALL ON FUNCTION public.reservar_slot_cnpj(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_slot_cnpj(int) TO service_role;

CREATE TRIGGER buscas_touch BEFORE UPDATE ON public.buscas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER leads_touch BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();