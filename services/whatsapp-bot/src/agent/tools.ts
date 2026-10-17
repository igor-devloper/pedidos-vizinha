import {
  describeCart,
  describeRule,
  finalUnitPrice,
  lotSize,
  removeLine,
  setLine,
  usesUnits,
  type AgentProduct,
  type SetLineArgs,
} from "./cart.js";
import {
  addDays,
  describeLocalDate,
  parseTime,
  PERIOD_WINDOWS,
  resolveDate,
  toInstant,
  weekdayOf,
  type LocalDate,
} from "./dates.js";
import { stripAccents } from "./name-matching.js";
import type { SiteApi, StoreInfo } from "./site-api.js";
import { describeDraft, formatScheduledAt, missingFields, parseLines, type DraftState } from "./state.js";

// Ferramentas do agente. O modelo só altera o pedido por aqui, e cada ferramenta valida em código.
// Em caso de erro devolvem { ok: false, erro, sugestoes } para o agente reformular com o cliente.

export type ToolResult = Record<string, unknown>;

export type ToolDeps = {
  products: AgentProduct[];
  getDraft(): DraftState;
  patchDraft(patch: Record<string, unknown>): Promise<DraftState>;
  resetDraft(): Promise<DraftState>;
  api: SiteApi;
  /** Mensagem direta ao cliente (resumo, Pix...), enviada na hora e registrada no histórico. */
  send(text: string): Promise<void>;
  notifyOwner(text: string): Promise<void>;
  handoff(reason: string): Promise<void>;
  lastCustomerText(): string;
  now(): Date;
  business: { name: string; cardapioUrl: string; pickupAddress: string; pickupReference?: string };
};

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const norm = (value: string) => stripAccents(value).toLowerCase().trim();
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function toInt(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : NaN;
}

const PAYMENT_METHODS = ["PIX", "CARTAO_CREDITO", "CARTAO_DEBITO"] as const;

function parsePaymentMethod(value: unknown) {
  const word = norm(text(value)).replace(/[^a-z]/g, "");
  if (!word) return undefined;
  if (word.includes("pix")) return "PIX";
  if (word.includes("debito")) return "CARTAO_DEBITO";
  if (word.includes("credito")) return "CARTAO_CREDITO";
  if (word.includes("cartao")) return "AMBIGUOUS";
  return null;
}

const AFFIRMATIVE = /^(sim|s|ss|simm+|pode|pode sim|pode ser|pode confirmar|confirmo|confirmado|confirma|confirmar|isso|isso mesmo|isso ai|ok|okay|okey|certo|certinho|correto|fechado|fechou|perfeito|otimo|beleza|blz|bora|vamos|positivo|tudo certo|ta certo|esta certo|ta bom|esta bom|quero|uhum|aham|claro|com certeza|tente novamente|tenta novamente|tentar novamente)\b/;
const HESITATION = /\b(mas|porem|so que|trocar|troca|mudar|muda|mude|alterar|altera|errado|errada|espera|aguarda|calma|nao)\b/;

/** O cliente confirmou claramente? Trava extra contra o modelo finalizar sozinho. */
export function isClearConfirmation(message: string) {
  const cleaned = norm(message).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return AFFIRMATIVE.test(cleaned) && !HESITATION.test(cleaned);
}

/** Próximos dias de funcionamento a partir do dia pedido (que está fechado). */
function openDaysAfter(date: LocalDate, weekly: StoreInfo["weekly"], count = 3) {
  const days: string[] = [];
  for (let offset = 1; offset <= 14 && days.length < count; offset += 1) {
    const candidate = addDays(date, offset);
    const entry = weekly.find((day) => day.weekday === weekdayOf(candidate));
    if (entry?.open) days.push(`${describeLocalDate(candidate)}, das ${entry.openHour}h às ${entry.closeHour}h`);
  }
  return days;
}

function matchDeliveryArea(info: StoreInfo, neighborhood: string) {
  const target = norm(neighborhood);
  return info.deliveryFees.find((area) => area.neighborhoods.some((name) => target.includes(norm(name)))) ?? null;
}

export function buildMenuMessage(products: AgentProduct[], business: ToolDeps["business"]) {
  const blocks = products.map((product) => {
    const price = finalUnitPrice(product);
    const original = Number(product.preco);
    const promo = product.emPromocao && price < original ? ` (de ${money(original)})` : "";
    const unitsLabel = usesUnits(product)
      ? `${money(price)}${promo} a cada ${product.totalUnidades} unidades`
      : `${money(price)}${promo}`;
    const lines = [`*${product.nome}* — ${unitsLabel}`];
    if (usesUnits(product)) lines.push(`Mínimo: ${lotSize(product)} unidades`);
    const rule = describeRule(product);
    if (rule) lines.push(rule);
    if (product.precisaSelecaoDeTipos && product.saboresSugeridos.length && String(product.categoria) !== "COMBO") {
      lines.push(`Sabores: ${product.saboresSugeridos.join(", ")}`);
    }
    return lines.join("\n");
  });

  return [
    `*Cardápio da ${business.name}* 😋`,
    ...blocks,
    `Com fotos, é só olhar aqui: ${business.cardapioUrl}`,
  ].join("\n\n");
}

export const TOOL_DECLARATIONS = [
  {
    name: "enviar_cardapio",
    description:
      "Envia ao cliente a mensagem do cardápio (produtos, preços, mínimos e sabores), já formatada. Use quando o cliente pedir o cardápio/preços ou no começo, para quem ainda não sabe o que pedir. Depois só pergunte o que ele quer; não repita o conteúdo.",
  },
  {
    name: "ver_cardapio",
    description:
      "Consulta (sem enviar nada) os produtos ativos, preços, promoções, mínimos, sabores permitidos e regras. Use para responder dúvidas. Nunca afirme preço, sabor ou regra que não esteja aqui.",
  },
  {
    name: "ver_horarios",
    description:
      "Horários de funcionamento reais, se a loja está aberta agora, antecedência mínima e próximos dias disponíveis. Use para qualquer pergunta sobre horário ou se está aberto.",
  },
  {
    name: "adicionar_item",
    description:
      "Adiciona ou ATUALIZA (substitui) um produto no pedido. Para produtos vendidos por unidades (Cento, Meio cento, Porção), 'quantidade' é o total de unidades; se o cliente falar em 'um cento', '2 porções', use quantidade_em='lotes' (o sistema calcula). 'sabores' é a lista COMPLETA de sabores desejados, com a quantidade de cada um (substitui a anterior). Se o cliente deu só um sabor, não precisa informar a quantidade. Para mudar só os sabores, omita 'quantidade'. Se o sistema devolver erro, explique ao cliente com suas palavras e ofereça as alternativas.",
    parameters: {
      type: "OBJECT",
      properties: {
        produto: { type: "STRING", description: "Nome do produto como o cliente disse (ex.: cento, meio cento, porção)." },
        quantidade: { type: "INTEGER", description: "Total de unidades (ou de pacotes, em produtos de pacote fixo)." },
        quantidade_em: { type: "STRING", enum: ["unidades", "lotes"], description: "'lotes' quando o cliente fala em cento/meio cento/porção. Padrão: unidades." },
        sabores: {
          type: "ARRAY",
          description: "Sabores e quantidade de cada um.",
          items: {
            type: "OBJECT",
            properties: {
              sabor: { type: "STRING", description: "Sabor como o cliente disse." },
              quantidade: { type: "INTEGER", description: "Unidades desse sabor." },
            },
            required: ["sabor"],
          },
        },
      },
      required: ["produto"],
    },
  },
  {
    name: "remover_item",
    description: "Tira um produto do pedido.",
    parameters: {
      type: "OBJECT",
      properties: { produto: { type: "STRING", description: "Produto a remover." } },
      required: ["produto"],
    },
  },
  {
    name: "ver_carrinho",
    description:
      "Mostra o pedido atual com subtotal calculado em código, o que falta preencher e o estado de cada item. Use antes de afirmar qualquer valor ou quando estiver em dúvida sobre o estado do pedido.",
  },
  {
    name: "definir_cliente",
    description:
      "Salva o nome do cliente e, se ele pedir, outro telefone de contato. O telefone do WhatsApp já é conhecido; só informe 'telefone_contato' se for diferente.",
    parameters: {
      type: "OBJECT",
      properties: {
        nome: { type: "STRING", description: "Nome do cliente." },
        telefone_contato: { type: "STRING", description: "Telefone com DDD, só se for diferente do WhatsApp." },
        email: { type: "STRING", description: "E-mail, só se o cliente oferecer. Não peça." },
      },
    },
  },
  {
    name: "definir_entrega",
    description:
      "Define entrega ou retirada. Em entrega, informe rua, número e bairro (referência é opcional; use 'Sem referência' se o cliente disser que não tem). Devolve a taxa de entrega do bairro, quando existir.",
    parameters: {
      type: "OBJECT",
      properties: {
        tipo: { type: "STRING", enum: ["entrega", "retirada"] },
        rua: { type: "STRING" },
        numero: { type: "STRING" },
        bairro: { type: "STRING" },
        referencia: { type: "STRING" },
      },
      required: ["tipo"],
    },
  },
  {
    name: "verificar_data_hora",
    description:
      "Valida e salva a data e hora da encomenda com as regras reais da loja (horário de funcionamento, antecedência, horário já ocupado). NUNCA calcule datas: informe 'dia_da_semana' (ex.: sábado), 'dia_relativo' (hoje, amanha) ou 'data' (AAAA-MM-DD). Sem 'hora', devolve a janela de horários disponível naquele dia, para você perguntar o horário exato. 'periodo' (manha, tarde, noite) reduz a janela.",
    parameters: {
      type: "OBJECT",
      properties: {
        data: { type: "STRING", description: "AAAA-MM-DD ou DD/MM." },
        dia_da_semana: { type: "STRING", description: "domingo, segunda, terca, quarta, quinta, sexta ou sabado." },
        dia_relativo: { type: "STRING", enum: ["hoje", "amanha", "depois de amanha"] },
        hora: { type: "STRING", description: "Ex.: 15:30 ou 15h." },
        periodo: { type: "STRING", enum: ["manha", "tarde", "noite"] },
      },
    },
  },
  {
    name: "definir_pagamento",
    description:
      "Define quanto pagar agora (50 ou 100 por cento) e a forma (pix, cartao_credito ou cartao_debito). 50% só é permitido se todos os produtos aceitarem. Pode informar um dos dois por vez.",
    parameters: {
      type: "OBJECT",
      properties: {
        percentual: { type: "INTEGER", enum: ["50", "100"], description: "50 ou 100." },
        forma: { type: "STRING", enum: ["pix", "cartao_credito", "cartao_debito"] },
      },
    },
  },
  {
    name: "ver_resumo",
    description:
      "Quando todos os dados estiverem completos: valida o pedido no site e ENVIA ao cliente o resumo oficial com total e valor a pagar. Depois peça apenas a confirmação do cliente; não repita o resumo e não invente valores.",
  },
  {
    name: "finalizar_pedido",
    description:
      "Cria o pedido e envia as instruções de pagamento. Só funciona depois de ver_resumo e se o cliente CONFIRMOU o resumo com um 'sim' claro em uma mensagem posterior. Nunca chame na mesma vez que ver_resumo.",
  },
  {
    name: "cancelar_pedido",
    description: "Descarta o pedido em andamento quando o cliente desistir ou pedir para recomeçar.",
  },
  {
    name: "chamar_humano",
    description:
      "Passa a conversa para a Vizinha (pausa o bot e avisa por WhatsApp). Use quando o cliente pedir uma pessoa, reclamar, tiver problema com pedido já feito, fizer pedido muito grande ou fora do padrão, perguntar algo que as ferramentas não respondem, ou estiver confuso/irritado após duas tentativas.",
    parameters: {
      type: "OBJECT",
      properties: { motivo: { type: "STRING", description: "Resumo curto do motivo, para a Vizinha." } },
      required: ["motivo"],
    },
  },
] as const;

export type ToolName = (typeof TOOL_DECLARATIONS)[number]["name"];

async function addItem(args: Record<string, unknown>, deps: ToolDeps): Promise<ToolResult> {
  if (!text(args.produto)) return { ok: false, erro: "Informe o produto." };
  let draft = deps.getDraft();
  // Pedido anterior já foi criado: recomeça um rascunho novo para este pedido.
  if (draft.orderId) draft = await deps.resetDraft();

  const quantidade = toInt(args.quantidade);
  if (Number.isNaN(quantidade)) return { ok: false, erro: "A quantidade precisa ser um número." };
  const sabores = Array.isArray(args.sabores)
    ? args.sabores.map((entry) => {
        const item = entry as { sabor?: unknown; quantidade?: unknown };
        const amount = toInt(item?.quantidade);
        return { sabor: text(item?.sabor), quantidade: amount === undefined || Number.isNaN(amount) ? undefined : amount };
      })
    : undefined;

  const input: SetLineArgs = {
    produto: text(args.produto),
    quantidade,
    quantidade_em: args.quantidade_em === "lotes" ? "lotes" : "unidades",
    sabores,
  };
  const result = setLine(deps.products, parseLines(draft), input);
  if (!result.ok) return { ...result };

  const updated = await deps.patchDraft({
    items: result.lines,
    stage: "COLLECTING",
    status: "ACTIVE",
    summarySentAt: null,
    whatsappOfferDueAt: null,
  });
  const cart = describeCart(deps.products, parseLines(updated));
  const view = cart.itens.find((item) => item.produto === result.product.nome);
  const hints: string[] = [];
  if (result.status.missingUnits > 0 && result.product.precisaSelecaoDeTipos) {
    hints.push(
      `Faltam ${result.status.missingUnits} unidades sem sabor. Pergunte os sabores (até ${result.status.maxTypes}); sugira uma divisão concreta e peça confirmação, nunca complete sozinho.`,
    );
  }
  return {
    ok: true,
    atualizado: result.replaced,
    item: view,
    totalDosProdutos: cart.totalDosProdutos,
    avisos: hints,
    faltaPreencher: missingFields(updated, deps.products),
  };
}

async function viewMenu(deps: ToolDeps): Promise<ToolResult> {
  let delivery: Array<{ area: string; taxa: string }> | undefined;
  try {
    const info = await deps.api.storeInfo();
    delivery = info.deliveryFees.map((area) => ({ area: area.area, taxa: money(area.fee) }));
  } catch {
    // taxas são complementares; o cardápio continua válido sem elas
  }

  return {
    ok: true,
    linkDoCardapio: deps.business.cardapioUrl,
    produtos: deps.products.map((product) => {
      const price = finalUnitPrice(product);
      return {
        nome: product.nome,
        descricao: product.descricao,
        preco: money(price),
        precoOriginal: product.emPromocao && price < Number(product.preco) ? money(Number(product.preco)) : undefined,
        vendidoPor: usesUnits(product) ? `unidades (preço para ${product.totalUnidades} un, proporcional acima do mínimo)` : "pacote fechado",
        minimoDeUnidades: usesUnits(product) ? lotSize(product) : product.totalUnidades,
        regraDeSabores: describeRule(product) || "sem escolha de sabores",
        sabores: String(product.categoria) === "COMBO" ? [] : product.saboresSugeridos,
        composicaoDoCombo: String(product.categoria) === "COMBO" ? product.comboItens : undefined,
        aceitaPagar50PorCento: product.permitePagamentoParcial,
        antecedenciaMinimaHoras: product.antecedenciaMinimaHoras ?? "regra da loja",
      };
    }),
    formasDePagamento: ["Pix", "Cartão de crédito", "Cartão de débito"],
    taxasDeEntrega: delivery,
    bairroForaDaTabela: "A taxa é combinada com a Vizinha.",
  };
}

async function viewHours(deps: ToolDeps): Promise<ToolResult> {
  const info = await deps.api.storeInfo();
  return {
    ok: true,
    abertoAgora: info.openNow,
    lojaFechadaPeloPainel: info.closedByOwner,
    horarioDeHoje: info.todayHours,
    horariosDaSemana: info.weeklyHours,
    antecedenciaMinimaHoras: info.minimumLeadHours,
    proximosDiasDisponiveis: info.nextOpenDays,
    aceitaEncomendaParaOutroDia: info.acceptsOrdersForFutureDates,
    enderecoDeRetirada: [deps.business.pickupAddress, deps.business.pickupReference].filter(Boolean).join(" — "),
  };
}

async function setCustomer(args: Record<string, unknown>, deps: ToolDeps): Promise<ToolResult> {
  const patch: Record<string, unknown> = {};
  const nome = text(args.nome);
  if (nome) patch.customerName = nome.slice(0, 80);
  const phone = text(args.telefone_contato).replace(/\D/g, "");
  if (text(args.telefone_contato)) {
    if (phone.length < 10 || phone.length > 13) return { ok: false, erro: "Telefone inválido. Peça com DDD." };
    patch.phone = phone;
  }
  const email = text(args.email);
  if (email) {
    if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, erro: "E-mail inválido." };
    patch.customerEmail = email;
  }
  if (Object.keys(patch).length === 0) return { ok: false, erro: "Nada para salvar: informe nome ou telefone." };
  const updated = await deps.patchDraft({ ...patch, stage: "COLLECTING", summarySentAt: null });
  return {
    ok: true,
    nome: updated.customerName,
    telefoneDeContato: updated.phone,
    faltaPreencher: missingFields(updated, deps.products),
  };
}

async function setFulfillment(args: Record<string, unknown>, deps: ToolDeps): Promise<ToolResult> {
  const kind = norm(text(args.tipo));
  if (kind !== "entrega" && kind !== "retirada") return { ok: false, erro: "tipo deve ser 'entrega' ou 'retirada'." };

  if (kind === "retirada") {
    const updated = await deps.patchDraft({ fulfillmentType: "PICKUP", stage: "COLLECTING", summarySentAt: null });
    return {
      ok: true,
      modalidade: "retirada",
      enderecoDeRetirada: [deps.business.pickupAddress, deps.business.pickupReference].filter(Boolean).join(" — "),
      faltaPreencher: missingFields(updated, deps.products),
    };
  }

  const patch: Record<string, unknown> = { fulfillmentType: "DELIVERY", stage: "COLLECTING", summarySentAt: null };
  if (text(args.rua)) patch.deliveryStreet = text(args.rua);
  if (text(args.numero)) patch.deliveryNumber = text(args.numero);
  if (text(args.bairro)) patch.deliveryNeighborhood = text(args.bairro);
  if (text(args.referencia)) patch.deliveryReference = text(args.referencia);
  const updated = await deps.patchDraft(patch);

  let taxa: string | undefined;
  if (updated.deliveryNeighborhood) {
    try {
      const area = matchDeliveryArea(await deps.api.storeInfo(), updated.deliveryNeighborhood);
      taxa = area ? money(area.fee) : "a combinar com a Vizinha";
    } catch {
      taxa = undefined;
    }
  }
  return {
    ok: true,
    modalidade: "entrega",
    taxaDeEntrega: taxa,
    faltaPreencher: missingFields(updated, deps.products),
  };
}

async function checkDateTime(args: Record<string, unknown>, deps: ToolDeps): Promise<ToolResult> {
  const now = deps.now();
  const resolved = resolveDate(now, {
    data: text(args.data) || undefined,
    dia_da_semana: text(args.dia_da_semana) || undefined,
    dia_relativo: text(args.dia_relativo) || undefined,
  });
  if (!resolved.ok) return { ok: false, erro: resolved.erro };

  const info = await deps.api.storeInfo();
  const weekday = weekdayOf(resolved.date);
  const day = info.weekly.find((entry) => entry.weekday === weekday);
  const label = describeLocalDate(resolved.date);

  if (!day?.open || day.openHour === null || day.closeHour === null) {
    return {
      ok: false,
      erro: `Não atendemos nesse dia (${label}).`,
      sugestoes: openDaysAfter(resolved.date, info.weekly),
    };
  }

  const period = PERIOD_WINDOWS[norm(text(args.periodo))];
  const from = Math.max(day.openHour, period?.from ?? 0);
  const to = Math.min(day.closeHour, period?.to ?? 24);

  if (!text(args.hora)) {
    if (from > to) {
      return { ok: false, erro: `Nesse período não atendemos em ${label}.`, sugestoes: [`Horário do dia: das ${day.openHour}h às ${day.closeHour}h`] };
    }
    return {
      ok: true,
      precisaDoHorario: true,
      data: label,
      janelaDisponivel: `das ${from}h às ${to}h`,
      instrucao: `Pergunte o horário exato dentro da janela (intervalos de ${info.slotMinutes} minutos). Antecedência mínima: ${info.minimumLeadHours}h.`,
    };
  }

  const time = parseTime(text(args.hora));
  if (!time) return { ok: false, erro: `Não entendi o horário "${text(args.hora)}". Peça no formato 15h ou 15:30.` };

  const instant = toInstant(resolved.date, time);
  const productIds = parseLines(deps.getDraft()).map((line) => line.productId);
  const check = await deps.api.checkSchedule(instant.toISOString(), productIds);
  if (!check.ok) {
    return { ok: false, erro: check.reason || "Horário indisponível.", sugestoes: check.suggestions ?? [] };
  }

  const updated = await deps.patchDraft({ scheduledAt: instant.toISOString(), stage: "COLLECTING", summarySentAt: null });
  return {
    ok: true,
    definido: formatScheduledAt(updated.scheduledAt),
    faltaPreencher: missingFields(updated, deps.products),
  };
}

async function setPayment(args: Record<string, unknown>, deps: ToolDeps): Promise<ToolResult> {
  const patch: Record<string, unknown> = {};

  const percent = toInt(args.percentual);
  if (percent !== undefined) {
    if (percent !== 50 && percent !== 100) return { ok: false, erro: "O percentual deve ser 50 ou 100." };
    const lines = parseLines(deps.getDraft());
    const blocking = deps.products.filter(
      (product) => lines.some((line) => line.productId === product.id) && !product.permitePagamentoParcial,
    );
    if (percent === 50 && blocking.length) {
      return {
        ok: false,
        erro: `Pagamento de 50% não vale para: ${blocking.map((product) => product.nome).join(", ")}. Nesse pedido o pagamento é integral (100%).`,
      };
    }
    patch.paymentPercentage = percent;
  }

  if (args.forma !== undefined) {
    const method = parsePaymentMethod(args.forma);
    if (method === "AMBIGUOUS") return { ok: false, erro: "Pergunte se o cartão é de crédito ou de débito." };
    if (!method || !PAYMENT_METHODS.includes(method as (typeof PAYMENT_METHODS)[number])) {
      return { ok: false, erro: "Aceitamos Pix, cartão de crédito e cartão de débito. Não aceitamos dinheiro nem pagamento na entrega." };
    }
    patch.paymentMethod = method;
  }

  if (Object.keys(patch).length === 0) return { ok: false, erro: "Informe o percentual (50 ou 100) e/ou a forma de pagamento." };
  const updated = await deps.patchDraft({ ...patch, stage: "COLLECTING", summarySentAt: null });
  return { ok: true, faltaPreencher: missingFields(updated, deps.products) };
}

async function showSummary(deps: ToolDeps): Promise<ToolResult> {
  const draft = deps.getDraft();
  const missing = missingFields(draft, deps.products);
  if (missing.length) return { ok: false, erro: "Ainda faltam dados para o resumo.", faltaPreencher: missing };

  const result = await deps.api.requestOrder(draft.id, true);
  if (!result.ok || !result.data?.summary) {
    const retryable = result.status >= 500 || result.status === 401;
    return {
      ok: false,
      erro: result.data?.error || "Não consegui conferir o pedido agora.",
      tentarNovamente: retryable,
      instrucao: retryable
        ? "Problema técnico: diga que o pedido está salvo e que vai tentar de novo, sem transferir para humano."
        : "Explique o problema e ajuste o dado correspondente com o cliente.",
    };
  }

  await deps.send(result.data.summary);
  await deps.patchDraft({ stage: "AWAITING_CONFIRMATION", summarySentAt: deps.now().toISOString() });
  return {
    ok: true,
    instrucao:
      "O resumo oficial já foi enviado ao cliente e termina pedindo a confirmação. Não repita nem reescreva o resumo; no máximo uma frase curta. Aguarde o 'sim' do cliente.",
  };
}

async function finalizeOrder(deps: ToolDeps): Promise<ToolResult> {
  const draft = deps.getDraft();
  if (draft.orderId) return { ok: false, erro: "Esse pedido já foi criado.", instrucao: "Informe que o pedido já está registrado." };

  if (draft.stage !== "AWAITING_CONFIRMATION" || !draft.summarySentAt) {
    return { ok: false, erro: "O cliente ainda não viu o resumo atualizado. Chame ver_resumo e aguarde a confirmação." };
  }
  const answeredAfterSummary =
    draft.lastCustomerMessageAt && new Date(draft.lastCustomerMessageAt).getTime() > new Date(draft.summarySentAt).getTime();
  if (!answeredAfterSummary) {
    return { ok: false, erro: "O cliente ainda não respondeu ao resumo. Pergunte se confirma e aguarde." };
  }
  if (!isClearConfirmation(deps.lastCustomerText())) {
    return { ok: false, erro: "O cliente não confirmou com clareza. Pergunte de novo, de forma simples: 'Posso confirmar o pedido?'" };
  }
  const missing = missingFields(draft, deps.products);
  if (missing.length) return { ok: false, erro: "O pedido mudou e está incompleto.", faltaPreencher: missing };

  const result = await deps.api.requestOrder(draft.id, false);
  const data = result.data;
  if (!result.ok || !data?.order) {
    const retryable = result.status >= 500 || result.status === 401;
    return {
      ok: false,
      erro: data?.error || "Não consegui criar o pedido agora.",
      tentarNovamente: retryable,
      instrucao: retryable
        ? "Problema técnico no pagamento: o pedido está salvo; diga que vai tentar de novo e peça 'tente novamente' se o cliente quiser."
        : "Explique o problema ao cliente e ajuste o necessário.",
    };
  }

  const order = data.order;
  const code = order.code || order.id.slice(0, 8).toUpperCase();
  const amount = money(Number(order.chargedAmount));
  if (data.pixCopyPaste) {
    await deps.send(
      `Seu pedido *#${code}* foi criado 😊\nValor a pagar agora: *${amount}*.\nCopie o código Pix da próxima mensagem e cole no app do seu banco. Assim que o pagamento for confirmado, eu aviso por aqui.`,
    );
    await deps.send(data.pixCopyPaste);
  } else if (data.checkoutUrl) {
    await deps.send(
      `Seu pedido *#${code}* foi criado 😊\nValor a pagar agora: *${amount}*.\nPague com cartão neste link seguro:\n${data.checkoutUrl}\nAssim que o pagamento for confirmado, eu aviso por aqui.`,
    );
  } else {
    return { ok: false, erro: "O pedido foi criado, mas não veio a forma de pagamento.", instrucao: "Avise que a Vizinha vai enviar o pagamento." };
  }

  const view = describeDraft(deps.getDraft(), deps.products);
  await deps.notifyOwner(
    [
      `🆕 *Novo pedido pelo WhatsApp #${code}*`,
      `Cliente: ${view.nome ?? "-"} (${view.telefoneDeContato ?? "-"})`,
      ...view.itens.map((item) => `• ${item.unidades} un ${item.produto}: ${item.subtotal}`),
      `${view.modalidade === "entrega" ? "Entrega" : "Retirada"}: ${view.dataEHora ?? "-"}`,
      view.enderecoDeEntrega ? `Endereço: ${view.enderecoDeEntrega}` : null,
      `Pagamento: ${view.pagamento ?? "-"} • a pagar agora ${amount}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return {
    ok: true,
    numeroDoPedido: code,
    instrucao:
      "As instruções de pagamento já foram enviadas ao cliente. Agradeça em uma frase curta e diga que avisa quando o pagamento for confirmado.",
  };
}

/** Executa uma ferramenta pelo nome. Nunca lança: erros viram { ok: false } para o agente reformular. */
export async function executeTool(name: string, args: Record<string, unknown>, deps: ToolDeps): Promise<ToolResult> {
  try {
    switch (name) {
      case "enviar_cardapio":
        await deps.send(buildMenuMessage(deps.products, deps.business));
        return { ok: true, instrucao: "Cardápio enviado. Não repita o conteúdo; pergunte o que o cliente quer pedir." };
      case "ver_cardapio":
        return await viewMenu(deps);
      case "ver_horarios":
        return await viewHours(deps);
      case "adicionar_item":
        return await addItem(args, deps);
      case "remover_item": {
        const result = removeLine(deps.products, parseLines(deps.getDraft()), text(args.produto));
        if (!result.ok) return { ...result };
        const updated = await deps.patchDraft({ items: result.lines, stage: "COLLECTING", summarySentAt: null });
        return { ok: true, removido: result.product.nome, faltaPreencher: missingFields(updated, deps.products) };
      }
      case "ver_carrinho":
        return { ok: true, ...describeDraft(deps.getDraft(), deps.products) };
      case "definir_cliente":
        return await setCustomer(args, deps);
      case "definir_entrega":
        return await setFulfillment(args, deps);
      case "verificar_data_hora":
        return await checkDateTime(args, deps);
      case "definir_pagamento":
        return await setPayment(args, deps);
      case "ver_resumo":
        return await showSummary(deps);
      case "finalizar_pedido":
        return await finalizeOrder(deps);
      case "cancelar_pedido":
        await deps.resetDraft();
        return { ok: true, instrucao: "Pedido descartado. Pergunte, com gentileza, se o cliente quer recomeçar." };
      case "chamar_humano": {
        const reason = text(args.motivo) || "Cliente pediu atendimento humano";
        await deps.handoff(reason);
        return {
          ok: true,
          instrucao:
            "A Vizinha foi avisada e o bot ficará em pausa nesta conversa. Diga ao cliente, com gentileza, que ela continua por aqui em breve.",
        };
      }
      default:
        return { ok: false, erro: `Ferramenta desconhecida: ${name}` };
    }
  } catch (error) {
    return {
      ok: false,
      erro: "Falha técnica ao executar a ferramenta.",
      detalhe: error instanceof Error ? error.message : String(error),
      instrucao: "Peça um instante ao cliente e tente de novo; se persistir, use chamar_humano.",
    };
  }
}
