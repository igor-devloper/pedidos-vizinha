// Casamento de nomes digitados pelo cliente ("coxinha de frango", "pastel doce", "risoles")
// com as opções reais cadastradas no banco. Nada aqui conhece produtos ou sabores fixos:
// as opções vêm sempre da lista recebida; só os sinônimos genéricos da língua ficam no código.

export type NameMatch =
  | { status: "match"; option: string }
  | { status: "ambiguous"; options: string[] }
  | { status: "none" };

const STOPWORDS = new Set([
  "de", "do", "da", "dos", "das", "com", "e", "a", "o", "os", "as", "um", "uma", "uns", "umas",
  "pra", "para", "por", "no", "na", "mini", "bem", "tipo", "sabor", "sabores", "quero", "queria",
]);

// Sinônimos e apelidos genéricos. Chave e valor já estão sem acento, em minúsculas e no singular.
const SYNONYMS: Record<string, string> = {
  doce: "acucarado",
  acucar: "acucarado",
  acucarada: "acucarado",
  docinho: "acucarado",
  pastelzinho: "pastel",
  pastelinho: "pastel",
  pasteizinho: "pastel",
  pasteis: "pastel",
  pastei: "pastel",
  risoles: "risole",
  rissole: "risole",
  rissoles: "risole",
  risolis: "risole",
  coxinhinha: "coxinha",
  bolinho: "bolinha",
  bolinhas: "bolinha",
  assado: "forno",
  assada: "forno",
};

export function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function stem(word: string) {
  let result = word;
  if (result.length > 4 && result.endsWith("zinho")) result = result.slice(0, -5);
  else if (result.length > 4 && result.endsWith("zinha")) result = result.slice(0, -5);
  if (result.length > 3 && result.endsWith("s")) result = result.slice(0, -1);
  return result;
}

export function tokenize(value: string) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .filter((word) => !STOPWORDS.has(word))
    .map((word) => SYNONYMS[word] ?? SYNONYMS[stem(word)] ?? stem(word))
    .filter((word, index, all) => all.indexOf(word) === index);
}

function editDistance(a: string, b: string) {
  if (a === b) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}

function typoTolerance(word: string) {
  if (word.length >= 8) return 2;
  if (word.length >= 5) return 1;
  return 0;
}

/** Corrige erros de digitação trocando palavras desconhecidas pela mais parecida do vocabulário. */
function repairTypos(words: string[], vocabulary: Set<string>) {
  return words.map((word) => {
    if (vocabulary.has(word)) return word;
    let best: { word: string; distance: number } | null = null;
    for (const candidate of vocabulary) {
      const distance = editDistance(word, candidate);
      if (distance <= typoTolerance(word) && (!best || distance < best.distance)) {
        best = { word: candidate, distance };
      }
    }
    return best?.word ?? word;
  });
}

const isSubset = (small: string[], large: string[]) => small.every((word) => large.includes(word));

/** Palavras do cliente em sequência no início do nome da opção ("cento" → "Cento Tradicional"). */
const isPrefix = (small: string[], large: string[]) => small.every((word, index) => large[index] === word);

export function matchName(input: string, options: string[]): NameMatch {
  const tokenized = options.map((option) => ({ option, words: tokenize(option) }));
  const vocabulary = new Set(tokenized.flatMap((entry) => entry.words));
  const typed = tokenize(input);
  if (typed.length === 0) return { status: "none" };

  const words = repairTypos(typed, vocabulary);
  const unique = (list: typeof tokenized) => {
    if (list.length === 1) return { status: "match", option: list[0].option } as const;
    if (list.length > 1) return { status: "ambiguous", options: list.map((entry) => entry.option) } as const;
    return null;
  };

  // 1) mesmas palavras; 2) o cliente disse só parte do nome; 3) o cliente disse a mais ("coxinha de frango").
  const exact = tokenized.filter((entry) => entry.words.length === words.length && isSubset(words, entry.words));
  if (exact.length) return unique(exact)!;

  const partial = tokenized.filter((entry) => isSubset(words, entry.words));
  if (partial.length) {
    const prefixed = partial.filter((entry) => isPrefix(words, entry.words));
    return unique(prefixed.length ? prefixed : partial)!;
  }

  const superset = tokenized.filter((entry) => entry.words.length > 0 && isSubset(entry.words, words));
  if (superset.length) {
    const longest = Math.max(...superset.map((entry) => entry.words.length));
    return unique(superset.filter((entry) => entry.words.length === longest))!;
  }

  return { status: "none" };
}

export type FlavorRequest = { sabor: string; quantidade?: number };
export type ResolvedFlavor = { tipo: string; quantidade: number };
export type FlavorProblem =
  | { input: string; kind: "none" }
  | { input: string; kind: "ambiguous"; options: string[] };

/** Resolve a lista de sabores do cliente para os nomes exatos das opções, somando repetidos. */
export function resolveFlavors(requests: FlavorRequest[], options: string[]) {
  const resolved = new Map<string, ResolvedFlavor>();
  const problems: FlavorProblem[] = [];

  for (const request of requests) {
    const match = matchName(request.sabor, options);
    if (match.status === "match") {
      const current = resolved.get(match.option);
      const quantidade = Math.floor(Number(request.quantidade) || 0);
      if (current) current.quantidade += quantidade;
      else resolved.set(match.option, { tipo: match.option, quantidade });
    } else if (match.status === "ambiguous") {
      problems.push({ input: request.sabor, kind: "ambiguous", options: match.options });
    } else {
      problems.push({ input: request.sabor, kind: "none" });
    }
  }

  return { resolved: [...resolved.values()], problems };
}
