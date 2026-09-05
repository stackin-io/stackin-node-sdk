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

export enum Environment {
  LOCAL = "local",
  TEST = "test",
  PRODUCTION = "production",
}
