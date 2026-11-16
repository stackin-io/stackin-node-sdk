export enum DocumentType {
  NFE = "nfe",
  NFSE = "nfse",
}

/** The recipient's four possible answers to a received document. */
export enum Manifestation {
  CONFIRMACAO = "210200",
  CIENCIA = "210210",
  DESCONHECIMENTO = "210220",
  OPERACAO_NAO_REALIZADA = "210240",
}

/** Why an NF-e is issued (finNFe). NF-e only; the API defaults to NORMAL. */
export enum Purpose {
  NORMAL = "normal",
  COMPLEMENTARY = "complementary",
  ADJUSTMENT = "adjustment",
  RETURN = "return",
}

/**
 * Which way the goods go (tpNF). IN is an incoming NF-e the company
 * issues itself, a sale returned by the buyer say. NF-e only; the API
 * defaults to OUT.
 */
export enum Direction {
  OUT = "out",
  IN = "in",
}

export enum Environment {
  LOCAL = "local",
  TEST = "test",
  PRODUCTION = "production",
}
