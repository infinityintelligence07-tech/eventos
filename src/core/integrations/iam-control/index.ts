import { config } from "@/core/config";

import { createIamControlClient, IamControlError } from "./client";

export {
  type ColaboradorRecebido,
  conferirSenhaNoIamControl,
  createIamControlClient,
  type IamControlClient,
  IamControlError,
  type RespostaColaboradores,
  type RespostaTurmas,
  type ResultadoDaSenha,
  type TurmaRecebida,
} from "./client";

/** Cliente com as credenciais do ambiente. Falha com mensagem clara se faltarem. */
export function iamControlDoAmbiente() {
  if (!config.IAM_CONTROL_URL || !config.IAM_CONTROL_EVENTOS_TOKEN) {
    throw new IamControlError("IAM_CONTROL_URL e IAM_CONTROL_EVENTOS_TOKEN são obrigatórias para sincronizar com o IAM Control");
  }
  return createIamControlClient({ baseUrl: config.IAM_CONTROL_URL, token: config.IAM_CONTROL_EVENTOS_TOKEN });
}
