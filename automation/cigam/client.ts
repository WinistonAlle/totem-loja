/**
 * Cliente CIGAM — criação de pedido pela API REST (Portais Web API).
 *
 * Adaptado de catalogo-funcionarios/automation/cigam/client.ts (mesma
 * empresa, mesmo CIGAM). Diferenças do totem:
 *   - Cliente fixo "Consumidor genérico" (CIGAM_CODIGO_CLIENTE, mesmo
 *     código do PDV — CIGAM_CLIENTE_CONSUMIDOR lá), não um cliente
 *     exclusivo por canal.
 *   - Série de nota CF1 (cupom fiscal real, transmite à SEFAZ) em vez de
 *     REC (recibo) — a efetivação aqui tem consequência fiscal real.
 *   - Sem os métodos de consulta de estoque/materiais/tabela de preço —
 *     não fazem parte do escopo desta integração.
 *
 * Fluxo do pedido (igual ao de referência):
 *   1. autenticar()                      -> CGPortal_Token (Bearer de tudo)
 *   2. POST comercial/fa/Pedido/Salvar   -> cabeçalho; o CIGAM gera o número
 *   3. POST .../Pedido/SalvarItemPedido  -> um por item
 *   4. POST .../Pedido/CalcularImposto   -> sem isto, Tipo Operação/CFOP e os
 *                                           totais do pedido ficam zerados
 *   5. PUT .../Pedido/AtualizarControlePedido -> libera p/ faturamento (best-effort)
 *   6. POST .../Pedido/Efetivar          -> emite CF1 (NF-e real via SEFAZ)
 */

export type CigamPedido = {
  /** Nosso código/ref (vai na observação). O CIGAM gera o número real do pedido. */
  codigo: string;
  observacao: string;
  /** yyyy-MM-dd. Default: hoje. */
  dataPedido?: string;
  codigoCondicaoPagamento?: string;
  tabelaPreco?: string;
  tipoNota?: string;
};

export type CigamItemPedido = {
  codigoMaterial: string;
  quantidade: number;
  precoUnitario: number;
  /** KG, PCT, CX, UN... (products.cigam_unit). Não é enviado ao CIGAM — a
   * API REST deriva a unidade do próprio cadastro do material. Usado só por
   * quem monta o item (process-pending-orders) para converter quantidade e
   * preço antes de chegar aqui. */
  unidadeMedida: string;
  codigoCentroArmazenagem?: string;
};

export class CigamError extends Error {
  /** Marca sessão derrubada por outro login (HTTP 500 + "Usuário não
   * autenticado" no corpo, NÃO 401) — só este caso é elegível a relogin+retry. */
  sessaoExpirada = false;

  constructor(
    message: string,
    public readonly status: number | null = null
  ) {
    super(message);
    this.name = "CigamError";
  }
}

type HttpCustomResponse<T = unknown> = {
  success: boolean;
  messages?: string[];
  data?: T;
  hash?: string;
};

export type EfetivarResultado = {
  success: boolean;
  codigoNotaFiscal?: string;
  erro?: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new CigamError(`Variável de ambiente ${name} não configurada.`);
  return value;
}

function extractHidden(html: string, name: string): string {
  const escaped = name.replace(/[.[\]]/g, "\\$&");
  const m = html.match(new RegExp(`name="${escaped}"[^>]+value="([^"]*)"`, "i"));
  return m?.[1] ?? "";
}

/** Data local em yyyy-MM-dd. Deliberadamente NÃO usa toISOString(): em
 * America/Sao_Paulo (UTC-3) vira o dia seguinte a partir das 21h. */
function hojeLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const TIMEOUT_PADRAO_MS = 30_000;
/** Efetivar conversa com a SEFAZ — rotineiramente passa de 30s. */
const TIMEOUT_EFETIVAR_MS = 60_000;

export class CigamClient {
  private cookieHeader: string | null = null;
  private token: string | null = null;
  private reloginPromise: Promise<void> | null = null;

  private readonly cfg = {
    baseUrl:
      process.env.CIGAM_BASE_URL ??
      (process.env.CIGAM_API_URL ?? "").replace(/\/api\/api\/?$/, "").replace(/\/+$/, ""),
    apiUrl: (
      process.env.CIGAM_API_URL ??
      `${(process.env.CIGAM_BASE_URL ?? "").replace(/\/+$/, "")}/api/api`
    ).replace(/\/+$/, ""),
    portalPath: process.env.CIGAM_PORTAL_PATH ?? "/portalrepresentante",
    user: () => requiredEnv("CIGAM_API_USER"),
    pass: () => requiredEnv("CIGAM_API_PASS"),
    // Consumidor genérico — mesmo código usado pelo PDV (CIGAM_CLIENTE_CONSUMIDOR lá).
    codigoCliente: process.env.CIGAM_CODIGO_CLIENTE ?? "5",
    tabelaPreco: process.env.CIGAM_TABELA_PRECO ?? "",
    condicaoPagamento: process.env.CIGAM_CONDICAO_PAGAMENTO ?? "",
    tipoNota: process.env.CIGAM_TIPO_NOTA ?? "N",
    centroArmazenagem: process.env.CIGAM_CENTRO_ARMAZENAGEM ?? "001",
    unidadeNegocio: process.env.CIGAM_UNIDADE_NEGOCIO ?? "100",
    controle: process.env.CIGAM_CONTROLE ?? "20",
    /** CF1 — cupom fiscal real, transmite à SEFAZ (diferente do REC do
     * catálogo de funcionários). */
    serieNota: process.env.CIGAM_NOTA_SERIE ?? "CF1",
  };

  private get portalUrl(): string {
    return `${this.cfg.baseUrl}${this.cfg.portalPath}`;
  }

  private static mergeSetCookies(existing: string, res: Response): string {
    const map = new Map<string, string>();
    for (const part of existing ? existing.split("; ") : []) {
      const eq = part.indexOf("=");
      if (eq > 0) map.set(part.slice(0, eq), part.slice(eq + 1));
    }
    const setCookies =
      typeof (res.headers as any).getSetCookie === "function"
        ? (res.headers as any).getSetCookie()
        : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie") as string]
        : [];
    for (const sc of setCookies as string[]) {
      const nameVal = (sc.split(";")[0] ?? "").trim();
      const eq = nameVal.indexOf("=");
      if (eq > 0) map.set(nameVal.slice(0, eq), nameVal.slice(eq + 1));
    }
    return Array.from(map, ([k, v]) => `${k}=${v}`).join("; ");
  }

  /** Login no portal do representante (form POST) só para obter o
   * CGPortal_Token — ver cabeçalho do arquivo para o porquê. */
  async autenticar(): Promise<void> {
    const loginUrl = `${this.portalUrl}/`;

    const pageRes = await fetch(loginUrl, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
    });
    let cookies = CigamClient.mergeSetCookies("", pageRes);
    const loginHtml = await pageRes.text();
    const csrf = extractHidden(loginHtml, "__RequestVerificationToken");
    if (!csrf) throw new CigamError("CSRF não encontrado na página de login do portal.");

    const form = new URLSearchParams({
      __RequestVerificationToken: csrf,
      Usuario: this.cfg.user(),
      Senha: this.cfg.pass(),
      ContinuarConectado: "true",
      ContinuarConectadoHidden: "false",
      ReturnUrl: `${this.cfg.portalPath}/ge/pessoa`,
    });
    const loginRes = await fetch(loginUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
        Referer: loginUrl,
      },
      body: form.toString(),
    });
    cookies = CigamClient.mergeSetCookies(cookies, loginRes);

    const token = /CGPortal_Token=([^;]+)/.exec(cookies)?.[1];
    if (!token) {
      throw new CigamError(
        "Login no portal falhou (CGPortal_Token não retornado). Confira usuário/senha.",
        loginRes.status
      );
    }
    this.cookieHeader = cookies;
    this.token = token;
  }

  private async ensureAuth(): Promise<string> {
    if (!this.token) await this.autenticar();
    return this.token!;
  }

  async verificarSessao(): Promise<boolean> {
    try {
      await this.ensureAuth();
      return true;
    } catch {
      return false;
    }
  }

  /** O CIGAM só admite UMA sessão ativa por usuário: outro login (o PDV usa
   * outra credencial, então isso normalmente não colide entre projetos, mas
   * colide se dois processos do totem rodarem com a mesma credencial ao
   * mesmo tempo) invalida a sessão em voo, e a próxima chamada falha com
   * HTTP 500 + "Usuário não autenticado" — NÃO 401. */
  private async withAuthRetry<T>(request: () => Promise<T>): Promise<T> {
    await this.ensureAuth();
    try {
      return await request();
    } catch (err) {
      if (!(err instanceof CigamError) || !err.sessaoExpirada) throw err;
      if (!this.reloginPromise) {
        this.reloginPromise = this.autenticar().finally(() => {
          this.reloginPromise = null;
        });
      }
      await this.reloginPromise;
      return await request();
    }
  }

  private async apiFetch<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    options: { body?: unknown; query?: Record<string, string>; timeoutMs?: number } = {}
  ): Promise<HttpCustomResponse<T>> {
    const url = new URL(`${this.cfg.apiUrl}${path}`);
    for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_PADRAO_MS),
    });

    const texto = await res.text();
    let payload: any = null;
    try {
      payload = texto ? JSON.parse(texto) : null;
    } catch {
      throw new CigamError(
        `Resposta inesperada do CIGAM em ${path} (HTTP ${res.status}): ${texto.slice(0, 200)}`,
        res.status
      );
    }

    const mensagens: string[] = payload?.messages ?? [];
    if (mensagens.some((m) => /n[ãa]o autenticado/i.test(m))) {
      const erro = new CigamError("Sessão CIGAM expirada (usuário não autenticado).", res.status);
      erro.sessaoExpirada = true;
      throw erro;
    }

    if (!res.ok && payload?.success === undefined) {
      throw new CigamError(
        mensagens.join("; ") || `Falha na chamada ${path} (HTTP ${res.status}).`,
        res.status
      );
    }

    return payload as HttpCustomResponse<T>;
  }

  private async criarCabecalho(pedido: CigamPedido): Promise<string> {
    const data = await this.withAuthRetry(() =>
      this.apiFetch<{ codigoPedido: string }>("POST", "/comercial/fa/Pedido/Salvar", {
        body: {
          Codigo: "",
          CodigoCliente: this.cfg.codigoCliente,
          DataPedido: pedido.dataPedido ?? hojeLocal(),
          CodigoCondicaoPagamento: pedido.codigoCondicaoPagamento ?? this.cfg.condicaoPagamento,
          CodigoControle: this.cfg.controle,
          CodigoUnidadeNegocio: this.cfg.unidadeNegocio,
          TipoNota: pedido.tipoNota ?? this.cfg.tipoNota,
          Observacao: pedido.observacao,
        },
      })
    );

    if (!data.success) {
      throw new CigamError(
        data.messages?.join("; ") || "Falha ao criar cabeçalho do pedido no CIGAM."
      );
    }

    const codigo = data.data?.codigoPedido;
    if (!codigo) throw new CigamError("CIGAM não retornou o número do pedido.");
    return String(codigo);
  }

  private async adicionarItem(
    codigoPedido: string,
    sequencia: number,
    item: CigamItemPedido,
    tabelaPreco: string,
    prazo: string
  ): Promise<void> {
    const data = await this.withAuthRetry(() =>
      this.apiFetch("POST", "/comercial/fa/Pedido/SalvarItemPedido", {
        body: {
          CodigoPedido: codigoPedido,
          Sequencia: sequencia,
          CodigoMaterial: item.codigoMaterial,
          Quantidade: item.quantidade,
          PrecoUnitario: item.precoUnitario,
          PrecoOriginal: item.precoUnitario,
          CodigoTabelaPreco: tabelaPreco,
          // Obrigatórios na prática, apesar de a doc marcar como opcionais.
          PrazoEntrega: prazo,
          PrazoProgramado: prazo,
          CodigoCentroArmazenagem: item.codigoCentroArmazenagem ?? this.cfg.centroArmazenagem,
        },
      })
    );

    if (!data.success) {
      throw new CigamError(
        data.messages?.join("; ") ||
          `Falha ao adicionar item ${item.codigoMaterial.trim()} (sequência ${sequencia}).`
      );
    }
  }

  /** Sem isto, "Tipo Operação"/CFOP e os totais do pedido ficam zerados. */
  async calcularImposto(codigoPedido: string): Promise<void> {
    const data = await this.withAuthRetry(() =>
      this.apiFetch("POST", "/comercial/fa/Pedido/CalcularImposto", {
        query: { codigoPedido },
      })
    );

    if (!data.success) {
      throw new CigamError(
        data.messages?.join("; ") || `Falha ao calcular impostos do pedido ${codigoPedido}.`
      );
    }
  }

  /** "20" (Pedido Gerado) -> "30" (Liberado para Faturamento). Este endpoint
   * NÃO valida se a transição é legal — sempre hardcodar "30" aqui. */
  async liberarPedidoParaFaturamento(codigoPedido: string): Promise<void> {
    const data = await this.withAuthRetry(() =>
      this.apiFetch("PUT", "/comercial/fa/Pedido/AtualizarControlePedido", {
        body: {
          Codigo: codigoPedido,
          CodigoCliente: this.cfg.codigoCliente,
          CodigoControle: "30",
        },
      })
    );

    if (!data.success) {
      throw new CigamError(
        data.messages?.join("; ") || `Falha ao liberar o pedido ${codigoPedido} para faturamento.`
      );
    }
  }

  /** Efetiva o pedido (controle "40") emitindo o documento CF1 — NF-e real,
   * transmite à SEFAZ. TipoFrete "F" (Sem Frete) com campos de transporte em
   * branco: outra combinação já rejeitou o XML na SEFAZ E queimou um número
   * sequencial de nota real (confirmado ao vivo no PDV). */
  async efetivarPedido(
    codigoPedido: string,
    itens: Array<{ sequencia: number; quantidade: number }>
  ): Promise<EfetivarResultado> {
    const agora = new Date();
    const data = await this.withAuthRetry(() =>
      this.apiFetch<{ codigoNotaFiscal?: string; erro?: string }>(
        "POST",
        "/comercial/fa/Pedido/Efetivar",
        {
          body: {
            Efetivacao: "S",
            Serie: this.cfg.serieNota,
            Transportadora: "",
            TipoFrete: "F",
            Placa: "",
            UF: "",
            Marca: "",
            Volume: 0,
            Quantidade: 0,
            Especie: "",
            DataSaida: hojeLocal(),
            HoraSaida: agora.toTimeString().slice(0, 8),
            UnidadeNegocio: this.cfg.unidadeNegocio,
            Pedido: {
              Codigo: codigoPedido,
              Itens: itens.map((i) => ({ SequenciaItem: i.sequencia, Quantidade: i.quantidade })),
            },
          },
          timeoutMs: TIMEOUT_EFETIVAR_MS,
        }
      )
    );

    return {
      success: data.success,
      codigoNotaFiscal: data.data?.codigoNotaFiscal || undefined,
      erro: data.data?.erro,
    };
  }

  /** Cria o pedido completo (cabeçalho + itens + cálculo de imposto). O
   * CIGAM gera o número do pedido — retornado em `cigamOrderId`.
   * `onHeaderCreated` roda logo após o cabeçalho, antes dos itens — persistir
   * o id imediatamente evita duplicata se a adição de itens falhar no meio.
   * Liberação para faturamento é best-effort: falha ali não invalida um
   * pedido já correto no CIGAM. Falha no cálculo de imposto é fatal. */
  async criarPedidoCompleto(
    pedido: CigamPedido,
    itens: CigamItemPedido[],
    onHeaderCreated?: (cigamOrderId: string) => Promise<void> | void
  ): Promise<{ cigamOrderId: string; itensEnviados: number; liberadoParaFaturamento: boolean }> {
    if (itens.length === 0) throw new CigamError(`Pedido ${pedido.codigo} sem itens.`);

    await this.ensureAuth();
    const cigamOrderId = await this.criarCabecalho(pedido);
    await onHeaderCreated?.(cigamOrderId);

    const tabela = pedido.tabelaPreco ?? this.cfg.tabelaPreco;
    const prazo = pedido.dataPedido ?? hojeLocal();
    let enviados = 0;
    for (const [index, item] of itens.entries()) {
      await this.adicionarItem(cigamOrderId, index + 1, item, tabela, prazo);
      enviados++;
    }

    await this.calcularImposto(cigamOrderId);

    let liberadoParaFaturamento = false;
    try {
      await this.liberarPedidoParaFaturamento(cigamOrderId);
      liberadoParaFaturamento = true;
    } catch (err) {
      console.error(
        `[cigam] pedido ${cigamOrderId} criado, mas não foi possível liberar para faturamento ` +
          `automaticamente — seguirá exigindo o passo manual "Situação" no CIGAM Desktop:`,
        err instanceof Error ? err.message : err
      );
    }

    return { cigamOrderId, itensEnviados: enviados, liberadoParaFaturamento };
  }
}
