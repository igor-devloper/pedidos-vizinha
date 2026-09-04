import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getAllowedSalgadoTypes, validateCartItemQuantities } from "../lib/cart-quantity";

const fixedProduct = {
  nome: "Cento",
  categoria: "CENTO",
  totalUnidades: 100,
  maxTiposSalgado: 5,
  precisaSelecaoDeTipos: true,
  quantidadeMinimaConfeiteira: null,
  productType: { minQuantity: 100, allowsMultiple: false },
};
const flavors = [
  { tipo: "Coxinha", quantidade: 25 },
  { tipo: "Risole", quantidade: 25 },
  { tipo: "Pastel", quantidade: 25 },
  { tipo: "Bolinho de queijo", quantidade: 25 },
];

test("25+25+25+25 para 100 e valido", () => {
  const result = validateCartItemQuantities({ product: fixedProduct, audience: "VIZINHA", quantity: 1, requestedUnits: 100, selectedItems: flavors });
  assert.equal(result.selectedUnits, 100);
  assert.equal(result.requestedUnits, 100);
});

test("50 unidades permitem 2 tipos e cada 100 permitem 4", () => {
  assert.equal(getAllowedSalgadoTypes(50, 7), 2);
  assert.equal(getAllowedSalgadoTypes(100, 7), 4);
  assert.equal(getAllowedSalgadoTypes(150, 7), 6);
  assert.equal(getAllowedSalgadoTypes(200, 7), 8);
});

test("backend rejeita sabor que nao pertence ao produto", () => {
  assert.throws(() => validateCartItemQuantities({
    product: { ...fixedProduct, totalUnidades: 50, productType: { minQuantity: 50, allowsMultiple: true }, saboresSugeridos: ["Coxinha de frango", "Empada de frango"] },
    audience: "VIZINHA", quantity: 1, requestedUnits: 50,
    selectedItems: [{ tipo: "Pastel frito", quantidade: 50 }],
  }), /não é uma opção disponível/);
});

test("99 informa a diferenca real", () => {
  assert.throws(
    () => validateCartItemQuantities({ product: fixedProduct, audience: "VIZINHA", quantity: 1, selectedItems: [...flavors.slice(0, 3), { tipo: "Bolinho", quantidade: 24 }] }),
    /Você selecionou 99 de 100 unidades/,
  );
});

test("101 e invalido em produto exato 100", () => {
  assert.throws(
    () => validateCartItemQuantities({ product: fixedProduct, audience: "VIZINHA", quantity: 1, requestedUnits: 101, selectedItems: [{ tipo: "Coxinha", quantidade: 101 }] }),
    /Você selecionou 101 de 100 unidades/,
  );
});

test("101 e valido em produto de minimo 100", () => {
  const result = validateCartItemQuantities({
    product: { ...fixedProduct, productType: { minQuantity: 100, allowsMultiple: true } },
    audience: "VIZINHA",
    quantity: 1,
    requestedUnits: 101,
    selectedItems: [{ tipo: "Coxinha", quantidade: 101 }],
  });
  assert.equal(result.mode, "MINIMUM");
  assert.equal(result.requestedUnits, 101);
});

test("tipos duplicados sao somados deterministicamente e zeros removidos", () => {
  const result = validateCartItemQuantities({
    product: fixedProduct,
    audience: "VIZINHA",
    quantity: 1,
    selectedItems: [
      { tipo: " Coxinha ", quantidade: 25 },
      { tipo: "coxinha", quantidade: 25 },
      { tipo: "", quantidade: 50 },
      { tipo: "Pastel", quantidade: 0 },
      { tipo: "Risole", quantidade: 50 },
    ],
  });
  assert.deepEqual(result.selectedItems, [
    { tipo: "Coxinha", quantidade: 50 },
    { tipo: "Risole", quantidade: 50 },
  ]);
});

test("produto sem selecao continua valido", () => {
  const result = validateCartItemQuantities({ product: { ...fixedProduct, precisaSelecaoDeTipos: false }, audience: "VIZINHA", quantity: 2, selectedItems: [] });
  assert.equal(result.requestedUnits, 200);
});

test("combo preserva composicao fixa", () => {
  const result = validateCartItemQuantities({
    product: { ...fixedProduct, categoria: "COMBO", comboItens: [{ nome: "Coxinha", quantidade: 50 }, { nome: "Risole", quantidade: 50 }] },
    audience: "VIZINHA",
    quantity: 1,
    selectedItems: [{ tipo: "Coxinha", quantidade: 50 }, { tipo: "Risole", quantidade: 50 }],
  });
  assert.equal(result.selectedUnits, 100);
});

test("confeiteira usa quantidade minima variavel", () => {
  const result = validateCartItemQuantities({
    product: { ...fixedProduct, quantidadeMinimaConfeiteira: 100 },
    audience: "CONFEITEIRA",
    quantity: 1,
    requestedUnits: 125,
    selectedItems: [{ tipo: "Coxinha", quantidade: 125 }],
  });
  assert.equal(result.requestedUnits, 125);
});

test("checkout aplica snapshot final na mesma transacao da criacao", () => {
  const source = readFileSync("app/api/checkout/cart/route.ts", "utf8");
  assert.match(source, /body\.items/);
  assert.match(source, /prisma\.\$transaction/);
  assert.match(source, /tx\.cartItem\.update/);
  assert.match(source, /tx\.order\.create/);
});

test("saves rapidos sao serializados e checkout aguarda o mais recente", () => {
  const source = readFileSync("components/cart-ui.tsx", "utf8");
  assert.match(source, /cartSaveChain\.current/);
  assert.match(source, /await cartSaveChain\.current/);
  assert.doesNotMatch(source, /Promise\.allSettled\(Array\.from\(selectedItemsSavePromises/);
});
