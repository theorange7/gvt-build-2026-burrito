export const ENV_MODES = ['local', 'dev', 'prod'] as const;
export type EnvMode = (typeof ENV_MODES)[number];

export function getEnvMode(): EnvMode {
  const raw = process.env.ENV_MODE;
  if (!raw) throw new Error('ENV_MODE is not set. Expected one of: local | dev | prod');
  if (!(ENV_MODES as readonly string[]).includes(raw)) {
    throw new Error(`Invalid ENV_MODE: "${raw}". Expected one of: local | dev | prod`);
  }
  return raw as EnvMode;
}
