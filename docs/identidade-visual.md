# Identidade visual da Vizinha

Base: o **magenta do logo**. O verde antigo do painel foi aposentado.

## Tokens (em `app/globals.css`, viram classes como `bg-brand`, `text-ink`)
| Token | Valor | Uso |
|---|---|---|
| `brand` | `#8A0F78` | Botões, preços, links, títulos de destaque |
| `brand-dark` | `#6B0F5C` | Hover e início do degradê |
| `brand-end` | `#9E1089` | Fim do degradê |
| `brand-vivid` | `#E000CF` | Só decoração (não serve para texto) |
| `brand-soft` | `#FDEBFA` | Selos, bordas leves, fundos suaves |
| `mint` / `mint-dark` | `#E3F8F5` / `#08534D` | Apoio (do logo) |
| `cream` | `#FFF7FC` | Fundo da página |
| `ink` / `ink-muted` | `#2B0A26` / `#5A3A54` | Texto |
| `open` / `closed` | `#095A30` / `#8F1111` | Status da loja e erros |
| `notice` / `notice-ink` | `#FFE08A` / `#3B2A00` | Avisos |

Degradê (`.vz-gradient`): `#6B0F5C → #8A0F78 → #9E1089` (texto branco: 7,3:1 no ponto mais claro).
Fonte: Montserrat. Texto base de 18px; mínimo de 16px.

## Contraste (todos pares de texto usados passam de 7:1)
Texto `ink` em `cream`/branco 17:1 · `ink-muted` 9,2:1 · `brand` em branco 8,7:1 · branco em `brand` 8,7:1 ·
branco em `brand-dark` 11,4:1 · branco em `brand-end` 7,3:1 · `mint-dark` em branco 8,9:1 · branco em `open` 8,3:1 ·
`closed` em `closed-soft` 8,0:1 · `notice-ink` em `notice` 10,7:1.
Bordas de campos usam `#B24AA3` (4,8:1 em branco).

## Peças reutilizáveis (`components/vizinha/ui.tsx`)
`Eyebrow`, `SectionHeading`, `Selo`, `ButtonLink`, `Faixa`, `StatusLoja`, `Cartao`.
Cabeçalho e rodapé: `site-chrome.tsx` e `site-footer.tsx` (aparecem no site todo, menos em `/manhia`).

## Ajustes sem mexer em código de layout
- Atendimento por WhatsApp no site: `SHOW_WHATSAPP_ORDER` em `lib/site-features.ts`.
- Depoimentos: lista `DEPOIMENTOS` em `lib/depoimentos.ts` (vazia = seção escondida).
- Fotos: `public/fotos/` (ver `docs/fotos-para-tirar.md`).
- Horários, produtos, sabores e promoção vêm do painel/banco.
