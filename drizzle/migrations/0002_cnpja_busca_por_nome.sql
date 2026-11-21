CREATE TABLE public.nicho_cnae (
  nicho text PRIMARY KEY,
  cnae text NOT NULL,
  descricao text
);
GRANT SELECT ON public.nicho_cnae TO authenticated;
GRANT ALL ON public.nicho_cnae TO service_role;
ALTER TABLE public.nicho_cnae ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ler tabela de nichos" ON public.nicho_cnae FOR SELECT TO authenticated USING (true);
INSERT INTO public.nicho_cnae (nicho, cnae, descricao) VALUES ('dentista', '8630504', 'Atividade odontológica');

CREATE TABLE public.cnpja_cache (
  chave text PRIMARY KEY,
  resposta jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.cnpja_cache TO service_role;
ALTER TABLE public.cnpja_cache ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leads ADD COLUMN cnpj_candidatos jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.leads ADD COLUMN site_proprio boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN cnpja_buscado boolean NOT NULL DEFAULT false;
ALTER TABLE public.buscas ADD COLUMN so_sem_site boolean NOT NULL DEFAULT false;

ALTER TABLE public.tarefas DROP CONSTRAINT IF EXISTS tarefas_tipo_check;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_tipo_check CHECK (tipo IN ('site','cnpj','busca_cnpj','cnpja'));

INSERT INTO public.app_config (chave, valor, descricao) VALUES
 ('cnpja_saldo_minimo', '10', 'Abaixo deste saldo de créditos do CNPJá, as buscas por nome param');
INSERT INTO public.api_estado (chave) VALUES ('cnpja');
UPDATE public.leads SET site_proprio = (site IS NOT NULL);