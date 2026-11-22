import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/AppShell";
import { Field, FormAlert } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pill } from "@/components/app/ui-bits";
import { perfilQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { excluirNichoCnae, infoConfiguracoes, salvarNichoCnae } from "@/lib/caderneta.functions";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Caderneta" },
      { name: "description", content: "Configurações na Caderneta." },
      { property: "og:title", content: "Configurações — Caderneta" },
      { property: "og:description", content: "Configurações na Caderneta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

const mensagemPadrao = "Olá! Vi a {empresa} e gostaria de conversar sobre um site para o negócio.";
const cnaeVisivel = (valor: string) => {
  const digitos = valor.replace(/\D/g, "");
  return digitos.length === 7 ? `${digitos.slice(0, 4)}-${digitos[4]}/${digitos.slice(5)}` : valor;
};

function Pagina() {
  const qc = useQueryClient();
  const statusFn = useServerFn(infoConfiguracoes);
  const salvarCnaeFn = useServerFn(salvarNichoCnae);
  const excluirCnaeFn = useServerFn(excluirNichoCnae);
  const { data: perfilData, isPending: carregandoPerfil } = useQuery(perfilQuery);
  const { data: nichos, isPending: carregandoNichos, isError: erroNichos } = useQuery({
    queryKey: ["nichos-cnae"],
    queryFn: async () => {
      const { data, error } = await supabase.from("nicho_cnae").select("nicho, cnae, descricao").order("nicho");
      if (error) throw error;
      return data;
    },
  });
  const { data: status, isPending: carregandoStatus, isFetching: atualizandoStatus, refetch: atualizarStatus } = useQuery({
    queryKey: ["configuracoes-status"], queryFn: () => statusFn(), staleTime: 30_000,
  });
  const [nome, setNome] = useState<string | null>(null);
  const [ocupacao, setOcupacao] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  const [erroPerfil, setErroPerfil] = useState("");
  const [nicho, setNicho] = useState("");
  const [cnae, setCnae] = useState("");
  const [descricao, setDescricao] = useState("");
  const [nichoOriginal, setNichoOriginal] = useState<string | null>(null);
  const [salvandoCnae, setSalvandoCnae] = useState(false);
  const [erroCnae, setErroCnae] = useState("");

  const perfil = perfilData?.perfil;
  async function salvarPerfil(e: FormEvent) {
    e.preventDefault();
    const nomeFinal = (nome ?? perfil?.nome ?? "").trim();
    const trabalhoFinal = (ocupacao ?? perfil?.trabalho ?? "").trim();
    const mensagemFinal = (mensagem ?? perfil?.mensagem_whatsapp ?? mensagemPadrao).trim();
    if (!nomeFinal || !trabalhoFinal || !mensagemFinal) { setErroPerfil("Preencha nome, ocupação e mensagem padrão."); return; }
    setSalvandoPerfil(true); setErroPerfil("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setErroPerfil("Sua sessão expirou. Entre novamente."); setSalvandoPerfil(false); return; }
    const { error } = await supabase.from("profiles").upsert({
      id: auth.user.id, nome: nomeFinal, trabalho: trabalhoFinal, mensagem_whatsapp: mensagemFinal, onboarding_ok: true,
    });
    setSalvandoPerfil(false);
    if (error) { setErroPerfil("Não foi possível salvar seu perfil."); return; }
    setNome(nomeFinal); setOcupacao(trabalhoFinal); setMensagem(mensagemFinal);
    toast.success("Configurações pessoais salvas.");
    await qc.invalidateQueries({ queryKey: ["perfil"] });
  }

  function editarNicho(item: NonNullable<typeof nichos>[number]) {
    setNichoOriginal(item.nicho); setNicho(item.nicho); setCnae(item.cnae); setDescricao(item.descricao ?? ""); setErroCnae("");
    document.getElementById("form-nicho")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function limparNicho() { setNichoOriginal(null); setNicho(""); setCnae(""); setDescricao(""); setErroCnae(""); }
  async function salvarNicho(e: FormEvent) {
    e.preventDefault();
    if (!nicho.trim()) { setErroCnae("Informe o nicho."); return; }
    if (cnae.replace(/\D/g, "").length !== 7) { setErroCnae("Informe um CNAE com sete dígitos."); return; }
    setSalvandoCnae(true); setErroCnae("");
    try {
      await salvarCnaeFn({ data: { nicho: nicho.trim(), cnae, descricao: descricao.trim() || undefined } });
      if (nichoOriginal && nichoOriginal !== nicho.trim().toLocaleLowerCase("pt-BR")) await excluirCnaeFn({ data: { nicho: nichoOriginal } });
      await qc.invalidateQueries({ queryKey: ["nichos-cnae"] });
      toast.success("Mapeamento de CNAE salvo."); limparNicho();
    } catch { setErroCnae("Não foi possível salvar. Confira o nicho e o CNAE."); }
    finally { setSalvandoCnae(false); }
  }
  async function removerNicho(nomeNicho: string) {
    if (!confirm(`Excluir o CNAE configurado para “${nomeNicho}”?`)) return;
    try { await excluirCnaeFn({ data: { nicho: nomeNicho } }); await qc.invalidateQueries({ queryKey: ["nichos-cnae"] }); toast.success("Mapeamento removido."); }
    catch { toast.error("Não foi possível remover o mapeamento."); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" desc="Seu perfil, os dados usados nas buscas e a conexão com os serviços." />

      <section className="card-soft p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-heading">Seu perfil e mensagem</h2>
        <form onSubmit={salvarPerfil} className="mt-4 space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="perfil-nome" label="Nome"><Input id="perfil-nome" value={nome ?? perfil?.nome ?? ""} onChange={(e) => setNome(e.target.value)} disabled={carregandoPerfil} /></Field>
            <Field id="perfil-ocupacao" label="Ocupação"><Input id="perfil-ocupacao" value={ocupacao ?? perfil?.trabalho ?? ""} onChange={(e) => setOcupacao(e.target.value)} placeholder="Ex.: crio sites para pequenos negócios" disabled={carregandoPerfil} /></Field>
          </div>
          <Field id="mensagem-padrao" label="Mensagem padrão de WhatsApp" hint="Use {empresa} para inserir o nome da empresa na mensagem.">
            <Textarea id="mensagem-padrao" rows={3} value={mensagem ?? perfil?.mensagem_whatsapp ?? mensagemPadrao} onChange={(e) => setMensagem(e.target.value)} disabled={carregandoPerfil} />
          </Field>
          {erroPerfil && <FormAlert kind="erro">{erroPerfil}</FormAlert>}
          <Button type="submit" className="min-h-11" loading={salvandoPerfil}>Salvar perfil</Button>
        </form>
      </section>

      <section className="card-soft p-5 sm:p-6">
        <div><h2 className="text-lg font-semibold text-heading">Nicho e CNAE</h2><p className="mt-1 text-sm text-muted-foreground">O mapeamento ajusta a busca por nome no CNPJá. Exemplo: dentista → 8630-5/04.</p></div>
        <form id="form-nicho" onSubmit={salvarNicho} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.5fr_auto_auto] xl:items-end" noValidate>
          <Field id="nicho" label="Nicho"><Input id="nicho" value={nicho} onChange={(e) => setNicho(e.target.value)} placeholder="Ex.: dentista" /></Field>
          <Field id="cnae" label="CNAE"><Input id="cnae" value={cnae} onChange={(e) => setCnae(e.target.value)} placeholder="8630-5/04" inputMode="numeric" /></Field>
          <Field id="descricao-cnae" label="Descrição (opcional)"><Input id="descricao-cnae" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Atividade odontológica" /></Field>
          <Button type="submit" className="min-h-11" loading={salvandoCnae}><Plus aria-hidden />{nichoOriginal ? "Salvar edição" : "Adicionar"}</Button>
          {nichoOriginal && <Button type="button" variant="outline" className="min-h-11" onClick={limparNicho}>Cancelar</Button>}
        </form>
        {erroCnae && <p className="mt-3 text-sm text-danger-text" role="alert">{erroCnae}</p>}
        {carregandoNichos ? <p className="mt-4 text-sm text-muted-foreground">Carregando mapeamentos…</p> : erroNichos ? <p className="mt-4 text-sm text-danger-text">Não foi possível carregar os CNAEs.</p> : (
          <ul className="mt-4 divide-y divide-border">
            {nichos?.map((item) => <li key={item.nicho} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-medium text-heading">{item.nicho} <span className="font-normal text-muted-foreground">→ {cnaeVisivel(item.cnae)}</span></p>{item.descricao && <p className="text-sm text-muted-foreground">{item.descricao}</p>}</div>
              <div className="flex gap-2"><Button type="button" variant="outline" className="min-h-11" onClick={() => editarNicho(item)}><Pencil aria-hidden />Editar</Button><Button type="button" variant="ghost" className="min-h-11 text-danger-text" onClick={() => void removerNicho(item.nicho)}><Trash2 aria-hidden />Excluir</Button></div>
            </li>)}
            {!nichos?.length && <li className="py-4 text-sm text-muted-foreground">Nenhum mapeamento cadastrado.</li>}
          </ul>
        )}
      </section>

      <section className="card-soft p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><h2 className="text-lg font-semibold text-heading">Conectores</h2><p className="mt-1 text-sm text-muted-foreground">As chaves ficam no servidor e não são exibidas nesta tela.</p></div>
          <Button type="button" variant="outline" className="min-h-11" disabled={atualizandoStatus} onClick={() => void atualizarStatus()}><RefreshCw className={atualizandoStatus ? "animate-spin" : ""} aria-hidden />Atualizar status</Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border p-4"><span className="font-medium text-heading">Apify</span>{carregandoStatus ? <span className="text-sm text-muted-foreground">Verificando…</span> : <Pill tone={status?.apify ? "ok" : "atencao"}>{status?.apify ? "Apify conectado" : "Apify não conectado"}</Pill>}</div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border p-4"><span className="font-medium text-heading">CNPJá</span>{carregandoStatus ? <span className="text-sm text-muted-foreground">Verificando…</span> : <div className="flex flex-wrap items-center gap-2"><Pill tone={status?.cnpja ? "ok" : "atencao"}>{status?.cnpja ? "CNPJá conectado" : "CNPJá não conectado"}</Pill>{status?.saldoCnpja !== null && status?.saldoCnpja !== undefined && <span className="text-sm text-muted-foreground">Saldo: {status.saldoCnpja} créditos</span>}</div>}</div>
        </div>
        {!carregandoStatus && status?.motivos.cnpja && <p className="mt-3 text-sm text-muted-foreground">CNPJá: {status.motivos.cnpja === "não configurado" ? "conector não configurado" : status.motivos.cnpja === "limite global de consultas" ? "aguardando a janela de consultas" : "não foi possível consultar o saldo agora"}.</p>}
        {!carregandoStatus && status?.motivos.apify && <p className="mt-1 text-sm text-muted-foreground">Apify: {status.motivos.apify === "não configurado" ? "conector não configurado" : "não foi possível validar a conexão agora"}.</p>}
      </section>
    </div>
  );
}
