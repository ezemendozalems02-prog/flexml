/**
 * Identidad del producto, centralizada.
 * Para renombrar la plataforma, editar ÚNICAMENTE este archivo.
 */
export const branding = {
  name: "FlexControl",
  tagline: "Gestión inteligente de entregas Flex para transportistas",
  shortName: "FlexControl",
  supportEmail: "soporte@flexcontrol.app",
} as const;

export type Branding = typeof branding;
