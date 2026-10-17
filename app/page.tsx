import Image from "next/image";
import type { Metadata } from "next";
import { Check, Clock3, MapPin, MessageCircle, PartyPopper, Star, Truck, Users, Utensils } from "lucide-react";

import { FotoOpcional } from "@/components/vizinha/foto-opcional";
import { ButtonLink, Cartao, Eyebrow, Faixa, SectionHeading, Selo, StatusLoja } from "@/components/vizinha/ui";
import { FloatingCart } from "@/components/cart-ui";
import { getFullStoreStatus } from "@/lib/business-hours";
import { prisma } from "@/lib/db";
import { DELIVERY_FEES } from "@/lib/delivery";
import { DEPOIMENTOS } from "@/lib/depoimentos";
import { formatCurrency } from "@/lib/pedidos";
import { normalizeSaboresList } from "@/lib/sabores";
import { BUSINESS_INFO } from "@/lib/site-config";
import { getPickupInfo, getWhatsAppOrderUrl, SHOW_WHATSAPP_ORDER } from "@/lib/site-features";
import { buildStoreStatusView, groupOpeningHours } from "@/lib/store-notice";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vizinha Salgateria | O sabor que mora ao lado",
  description:
    "Salgadinhos para aniversário, reunião ou café da tarde. Escolha os sabores, diga o dia e a Vizinha prepara com carinho.",
};

type Produto = Awaited<ReturnType<typeof getProdutos>>[number];

async function getProdutos() {
  try {
    const produtos = await prisma.produto.findMany({
      where: { ativo: true },
      orderBy: [{ emPromocao: "desc" }, { createdAt: "desc" }],
      include: { productType: true },
    });
    return produtos.map((produto) => ({
      ...produto,
      preco: Number(produto.preco),
      sabores: normalizeSaboresList(produto.saboresSugeridos),
    }));
  } catch (error) {
    console.error("GET produtos home error", error);
    return [];
  }
}

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const slugify = (value: string) => normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function lotOf(produto: Produto) {
  return produto.productType?.allowsMultiple && produto.productType.minQuantity ? produto.productType.minQuantity : produto.totalUnidades;
}

/** "Ideal para..." pelo tamanho do lote, sem depender do nome do produto. */
function idealPara(produto: Produto) {
  const lot = lotOf(produto);
  if (lot >= 100) return { text: "Ideal para festas e aniversários.", Icon: PartyPopper };
  if (lot >= 50) return { text: "Ideal para reuniões pequenas.", Icon: Users };
  return { text: "Ideal para o lanche da família.", Icon: Utensils };
}

function precoFinal(produto: Produto) {
  const desconto = produto.emPromocao ? Number(produto.descontoPercentual || 0) : 0;
  return Number((produto.preco * (1 - desconto / 100)).toFixed(2));
}

function ProdutoCard({ produto }: { produto: Produto }) {
  const { text, Icon } = idealPara(produto);
  const lot = lotOf(produto);
  const price = precoFinal(produto);
  const promo = produto.emPromocao && price < produto.preco;
  const isCombo = String(produto.categoria) === "COMBO";
  const resumo = [
    `${lot} salgados`,
    produto.precisaSelecaoDeTipos && !isCombo ? `até ${produto.maxTiposSalgado} sabores` : null,
  ].filter(Boolean);

  return (
    <article aria-labelledby={`produto-${produto.id}`} className="flex h-full">
      <Cartao className="flex w-full flex-col">
        <div className="relative">
          <div className="relative aspect-[4/3] bg-brand-soft">
            <Image src={produto.imagemBase64} alt={`Foto de ${produto.nome}`} fill unoptimized className="object-cover" />
            {promo ? <Selo tone="brand" className="absolute left-4 top-4">Promoção</Selo> : null}
          </div>
          <span
            aria-hidden="true"
            className="absolute -bottom-7 left-5 flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-brand text-white shadow-md"
          >
            <Icon className="h-6 w-6" />
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-5 pt-11">
          <div className="space-y-1">
            <h3 id={`produto-${produto.id}`} className="text-2xl font-extrabold leading-tight text-ink">
              {produto.nome}
            </h3>
            <p className="text-lg text-ink-muted">{resumo.join(" · ")}</p>
            <p className="text-lg font-semibold text-ink">{text}</p>
          </div>

          <p className="mt-auto flex flex-wrap items-baseline gap-x-2">
            {promo ? (
              <span className="text-lg text-ink-muted line-through">
                <span className="sr-only">Antes: </span>
                {formatCurrency(produto.preco)}
              </span>
            ) : null}
            <span className="text-3xl font-extrabold text-brand">
              <span className="sr-only">Preço: </span>
              {formatCurrency(price)}
            </span>
          </p>

          <ButtonLink href={`/pedido/${produto.slug}`} variant="primary" className="sm:w-full">
            Escolher sabores
          </ButtonLink>
        </div>
      </Cartao>
    </article>
  );
}

type Sabor = { nome: string; produtos: string[] };

/** Junta os sabores de todos os produtos (do cadastro), sem repetir, com onde cada um aparece. */
function juntarSabores(produtos: Produto[]) {
  const mapa = new Map<string, Sabor>();
  for (const produto of produtos) {
    if (!produto.precisaSelecaoDeTipos || String(produto.categoria) === "COMBO") continue;
    for (const nome of produto.sabores) {
      const key = normalize(nome);
      const atual = mapa.get(key) ?? { nome, produtos: [] };
      if (!atual.produtos.includes(produto.nome)) atual.produtos.push(produto.nome);
      mapa.set(key, atual);
    }
  }
  return [...mapa.values()].sort((a, b) => b.produtos.length - a.produtos.length || a.nome.localeCompare(b.nome, "pt-BR"));
}

export default async function HomePage() {
  const [produtos, status] = await Promise.all([getProdutos(), getFullStoreStatus()]);
  const destaque = produtos.find((produto) => produto.id === status.featuredProductId) ?? produtos[0] ?? null;
  const promocao = produtos.find((produto) => produto.emPromocao && precoFinal(produto) < produto.preco) ?? null;
  const sabores = juntarSabores(produtos);
  const horarios = groupOpeningHours(status.operationSchedule);
  const pickup = getPickupInfo();
  const statusView = buildStoreStatusView({ operationSchedule: status.operationSchedule, closedByOwner: status.closedByOwner });
  const whatsappUrl = getWhatsAppOrderUrl();

  return (
    <>
      {/* 4.2 Topo */}
      <section className="vz-hero-bg relative overflow-x-clip px-4 pb-16 pt-8 sm:px-6 sm:pb-24 sm:pt-12 lg:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            <Eyebrow>Feito pela Vizinha</Eyebrow>
            <h1 className="text-4xl font-extrabold leading-tight text-ink sm:text-5xl lg:text-6xl">O sabor que mora ao lado.</h1>
            <p className="max-w-xl text-xl leading-relaxed text-ink-muted">
              Salgadinhos para o seu aniversário, reunião ou café da tarde. Escolha os sabores, diga o dia e a Vizinha prepara com carinho.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <ButtonLink href="/cardapio#produtos" variant="primary">Fazer minha encomenda</ButtonLink>
              {SHOW_WHATSAPP_ORDER ? (
                <ButtonLink href={whatsappUrl} external variant="secondary" icon={<MessageCircle className="h-6 w-6" aria-hidden="true" />}>
                  Pedir pelo WhatsApp
                </ButtonLink>
              ) : null}
            </div>
          </div>

          <div className="relative">
            <span aria-hidden="true" className="vz-dot -right-2 -top-6 h-28 w-28 bg-brand-soft" />
            <span aria-hidden="true" className="vz-dot -bottom-6 -left-2 h-24 w-24 bg-mint" />
            <span aria-hidden="true" className="vz-dot right-12 top-10 z-10 h-5 w-5 bg-brand-vivid" />
            <span aria-hidden="true" className="vz-dot bottom-24 right-2 z-10 h-4 w-4 bg-mint-dark" />
            <div className="relative aspect-[4/3] overflow-hidden rounded-[2.5rem] border-4 border-white bg-brand-soft shadow-xl">
              {destaque ? (
                <Image src={destaque.imagemBase64} alt={`Salgados da Vizinha: ${destaque.nome}`} fill priority unoptimized className="object-cover" />
              ) : (
                <div className="vz-gradient flex h-full items-center justify-center">
                  <Image src="/vizinha-logo.png" alt="Logo da Vizinha Salgateria" width={160} height={160} className="rounded-full" />
                </div>
              )}
            </div>
            <StatusLoja view={statusView} className="relative mt-5 lg:absolute lg:-bottom-8 lg:-left-8 lg:mt-0 lg:max-w-xs" />
          </div>
        </div>
      </section>

      {/* 4.3 Produtos */}
      {produtos.length > 0 ? (
        <section id="encomenda" aria-labelledby="titulo-encomenda" className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-6xl space-y-10">
            <SectionHeading id="titulo-encomenda" eyebrow="Nosso cardápio" title="Do tamanho da sua festa.">
              Escolha a quantidade e monte com os sabores que você mais gosta.
            </SectionHeading>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {produtos.map((produto) => (
                <ProdutoCard key={produto.id} produto={produto} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* 4.4 Sabores */}
      {sabores.length > 0 ? (
        <section aria-labelledby="titulo-sabores" className="vz-section-soft px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-6xl space-y-10">
            <SectionHeading id="titulo-sabores" eyebrow="Os queridinhos" title="Sabor de vizinha, carinho em cada pedido." />
            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {sabores.map((sabor) => (
                <li key={sabor.nome}>
                  <Cartao tone="mint" className="flex h-full items-center gap-4 p-4">
                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-white/70">
                      <FotoOpcional
                        src={`/fotos/${slugify(sabor.nome)}.jpg`}
                        alt=""
                        className="object-cover"
                        fallback={
                          <span aria-hidden="true" className="text-4xl font-extrabold text-brand">
                            {sabor.nome.charAt(0).toUpperCase()}
                          </span>
                        }
                      />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xl font-extrabold text-ink">{sabor.nome}</h3>
                      <p className="text-base text-ink-muted">Aparece em: {sabor.produtos.join(", ")}</p>
                    </div>
                  </Cartao>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* 4.5 Promoção (só quando houver) */}
      {promocao ? (
        <Faixa>
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl space-y-3">
              <Eyebrow tone="light">Promoção</Eyebrow>
              <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">
                {promocao.nome} por {formatCurrency(precoFinal(promocao)).replace(",00", "")}
              </h2>
              <p className="text-xl">
                Antes {formatCurrency(promocao.preco)}.
                {promocao.precisaSelecaoDeTipos ? ` Até ${promocao.maxTiposSalgado} sabores a cada ${lotOf(promocao)} salgados.` : ""}
              </p>
            </div>
            <ButtonLink href={`/pedido/${promocao.slug}`} variant="onDark">
              Quero aproveitar
            </ButtonLink>
          </div>
        </Faixa>
      ) : null}

      {/* 4.6 Como encomendar */}
      <section aria-labelledby="titulo-passos" className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-10">
          <SectionHeading id="titulo-passos" eyebrow="É fácil" title="Sua encomenda em 3 passos" />
          <ol className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              { titulo: "Escolha", texto: "o tamanho e os sabores." },
              { titulo: "Diga quando", texto: "e se vai buscar ou receber em casa." },
              { titulo: "Pague metade para reservar", texto: "ou o valor todo. Pronto, a Vizinha cuida do resto." },
            ].map((passo, index) => (
              <li key={passo.titulo}>
                <Cartao className="h-full space-y-3 p-6">
                  <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-xl font-extrabold text-white">
                    {index + 1}
                  </span>
                  <p className="text-xl font-extrabold text-ink">
                    <span className="sr-only">Passo {index + 1}: </span>
                    {passo.titulo}
                  </p>
                  <p className="text-lg text-ink-muted">{passo.texto}</p>
                </Cartao>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 4.7 Feito pela Vizinha */}
      <section aria-labelledby="titulo-quem-faz" className="vz-section-mint px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[2.5rem] bg-brand-soft">
            <FotoOpcional
              src="/fotos/vizinha-cozinha.jpg"
              alt="A Vizinha preparando os salgados na cozinha"
              className="object-cover"
              fallback={<Image src="/vizinha-logo.png" alt="" width={200} height={200} className="rounded-full border-4 border-white shadow-md" />}
            />
          </div>
          <div className="space-y-5">
            <SectionHeading id="titulo-quem-faz" eyebrow="Quem faz" title="Feito pela Vizinha." />
            <p className="max-w-xl text-lg leading-relaxed text-ink">
              Cada salgado é preparado pela Vizinha com o mesmo cuidado de quem cozinha para a própria família. A encomenda é feita sob medida para a sua festa, do jeito que você escolher.
            </p>
          </div>
        </div>

        {DEPOIMENTOS.length > 0 ? (
          <div className="mx-auto mt-14 max-w-6xl">
            <h3 className="sr-only">O que os vizinhos dizem</h3>
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {DEPOIMENTOS.map((depoimento) => (
                <li key={`${depoimento.nome}-${depoimento.bairro}`}>
                  <Cartao className="h-full space-y-4 p-6">
                    <p aria-hidden="true" className="text-6xl font-extrabold leading-none text-brand">“</p>
                    <p className="text-xl leading-relaxed text-ink">{depoimento.texto}</p>
                    <p className="flex gap-1 text-brand" role="img" aria-label="5 estrelas de 5">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star key={i} className="h-5 w-5 fill-current" aria-hidden="true" />
                      ))}
                    </p>
                    <div className="flex items-center gap-3">
                      {depoimento.foto ? (
                        <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-full bg-brand-soft">
                          <FotoOpcional src={depoimento.foto} alt={`Foto de ${depoimento.nome}`} className="object-cover" fallback={null} />
                        </span>
                      ) : null}
                      <p className="text-lg font-bold text-ink">
                        {depoimento.nome} <span className="font-normal text-ink-muted">· {depoimento.bairro}</span>
                      </p>
                    </div>
                  </Cartao>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* 4.8 Faixa WhatsApp */}
      {SHOW_WHATSAPP_ORDER ? (
        <Faixa>
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl space-y-3">
              <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">Prefere conversar?</h2>
              <p className="text-xl">Faça sua encomenda pelo WhatsApp. A gente te ajuda a escolher.</p>
              <p className="text-xl font-extrabold">{BUSINESS_INFO.supportPhone}</p>
            </div>
            <ButtonLink href={whatsappUrl} external variant="onDark" icon={<MessageCircle className="h-6 w-6" aria-hidden="true" />}>
              Chamar no WhatsApp
            </ButtonLink>
          </div>
        </Faixa>
      ) : null}

      {/* 4.9 Horários, retirada e entrega */}
      <section aria-labelledby="titulo-horarios" className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-10">
          <SectionHeading id="titulo-horarios" eyebrow="Quando e onde" title="Horário de funcionamento" />

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <Cartao className="p-6">
              <h3 className="flex items-center gap-2 text-xl font-extrabold text-ink">
                <Clock3 className="h-6 w-6 text-brand" aria-hidden="true" />
                Horários
              </h3>
              <table className="mt-4 w-full text-left text-lg">
                <caption className="sr-only">Horário de funcionamento da semana</caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Dia</th>
                    <th scope="col">Horário</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-soft">
                  {horarios.map((row) => (
                    <tr key={row.label}>
                      <th scope="row" className="py-3 pr-4 font-bold text-ink">{row.label}</th>
                      <td className={row.open ? "py-3 text-ink" : "py-3 font-bold text-closed"}>{row.hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-4 text-base text-ink-muted">Você pode encomendar para qualquer dia em que a loja abre, mesmo com a loja fechada agora.</p>
            </Cartao>

            <div className="space-y-6">
              {pickup ? (
                <Cartao tone="mint" className="space-y-3 p-6">
                  <h3 className="flex items-center gap-2 text-xl font-extrabold text-ink">
                    <MapPin className="h-6 w-6 text-brand" aria-hidden="true" />
                    Retirada
                  </h3>
                  <p className="text-lg text-ink">{pickup.address}</p>
                  {pickup.reference ? <p className="text-lg text-ink-muted">{pickup.reference}</p> : null}
                  <ButtonLink href={pickup.mapsUrl} external variant="secondary">
                    Abrir no mapa
                  </ButtonLink>
                </Cartao>
              ) : null}

              <Cartao className="p-6">
                <h3 className="flex items-center gap-2 text-xl font-extrabold text-ink">
                  <Truck className="h-6 w-6 text-brand" aria-hidden="true" />
                  Entregamos do Centro de Cabedelo até Camboinha
                </h3>
                <ul className="mt-4 divide-y divide-brand-soft text-lg">
                  {DELIVERY_FEES.map((area) => (
                    <li key={area.label} className="flex items-start justify-between gap-4 py-3">
                      <span className="text-ink">{area.label}</span>
                      <span className="shrink-0 font-extrabold text-brand">{formatCurrency(area.fee)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 flex items-start gap-2 text-base text-ink-muted">
                  <Check className="mt-1 h-5 w-5 shrink-0 text-open" aria-hidden="true" />
                  Fora dessa área, só retirada.
                </p>
              </Cartao>
            </div>
          </div>
        </div>
      </section>

      <FloatingCart
        siteTheme={status.siteTheme}
        businessStatus={{
          isOpen: status.isOpen,
          message: status.message,
          minimumLeadHours: status.minimumLeadHours,
          operationSchedule: status.operationSchedule,
        }}
      />
    </>
  );
}
