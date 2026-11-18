const SALTOS_VALIDOS = /^\d+$/;

/**
 * Valor de `trust proxy` de Express a partir de `TRUST_PROXY` (RES-030).
 * Sin definir o inválido vale `false`; un entero indica los saltos de confianza.
 * Nunca devuelve `true`: confiaría en cualquier cabecera `X-Forwarded-For`.
 */
export const leerTrustProxy = (valor: string | undefined): number | false => {
  if (valor === undefined || !SALTOS_VALIDOS.test(valor)) {
    return false;
  }

  return Number(valor);
};
