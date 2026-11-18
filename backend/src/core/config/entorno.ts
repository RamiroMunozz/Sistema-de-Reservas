/**
 * Lee una variable de entorno como entero positivo. Si no está definida o no
 * es un entero positivo, devuelve el valor por defecto.
 */
export const leerEnteroPositivo = (
  nombre: string,
  valorPorDefecto: number,
): number => {
  const valor = process.env[nombre];

  if (valor === undefined || !/^\d+$/.test(valor)) {
    return valorPorDefecto;
  }

  const numero = Number(valor);

  return numero > 0 ? numero : valorPorDefecto;
};
