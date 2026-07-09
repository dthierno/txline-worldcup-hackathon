export type TxlineNetwork = "mainnet" | "devnet";

export type TxlineRuntimeConfig = {
  apiBaseUrl: string;
  apiOrigin: string;
  configured: boolean;
  jwt?: string;
  network: TxlineNetwork;
  token?: string;
};

export function getTxlineConfig(): TxlineRuntimeConfig {
  const network =
    process.env.TXLINE_NETWORK === "mainnet" ? "mainnet" : "devnet";
  const apiOrigin =
    process.env.TXLINE_API_ORIGIN ??
    (network === "mainnet"
      ? "https://txline.txodds.com"
      : "https://txline-dev.txodds.com");
  const jwt = process.env.TXLINE_JWT;
  const token = process.env.TXLINE_API_TOKEN;

  return {
    apiBaseUrl: `${apiOrigin}/api`,
    apiOrigin,
    configured: Boolean(jwt && token),
    jwt,
    network,
    token,
  };
}
