/**
 * Quem entrou com um Google que o Eventos não reconhece: o cadastro nasce no IAM Control, não aqui (docs/10).
 * O botão abre o "entrar com Google" do IAM Control (GET /api/auth/google, o mesmo do site dele), que cria a conta
 * quando ela não existe e deixa aguardando aprovação. Abre em outra aba para esta ficar esperando a volta.
 * O prazo vem da sincronização de colaboradores (SINCRONIZAR_COLABORADORES_CRON: a cada 30 minutos, das 6h às 23h).
 */
export function AvisoSemCadastro({ urlDoIamControl }: { urlDoIamControl: string }) {
  return (
    <div className="login-aviso" role="alert">
      <p className="login-aviso-titulo">Esta conta Google ainda não tem cadastro no IAM Control</p>
      <p>O Eventos usa as contas do IAM Control. Crie a sua lá com o mesmo Google e depois volte aqui.</p>
      <a className="login-submit" href={new URL("/api/auth/google", urlDoIamControl).toString()} target="_blank" rel="noopener noreferrer">
        Criar conta no IAM Control com o Google
      </a>
      <ol>
        <li>Crie a conta pelo botão acima. Ela abre em outra aba.</li>
        <li>Espere um administrador do IAM Control aprovar o cadastro.</li>
        <li>Volte a esta tela e entre de novo. Depois da aprovação, o Eventos leva até 30 minutos para reconhecer a conta.</li>
      </ol>
    </div>
  );
}
