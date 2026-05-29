// @ts-expect-error: Deno-specific URL imports
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error: Deno-specific URL imports
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-expect-error: Deno-specific URL imports
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-expect-error: Deno-specific URL imports
import JSZip from "https://esm.sh/jszip@3.10.1";

const EMAIL_INVITE_TEMPLATE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Convite para o SIGESS</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e4e4e7; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);">
                    <tr>
                        <td align="center" style="padding: 40px 40px 20px 40px;">
                            <div style="font-size: 20px; font-weight: 800; color: #059669; letter-spacing: 1px; display: inline-block; padding: 8px 16px; background-color: #ecfdf5; border-radius: 8px; border: 1px solid #d1fae5;">
                                SIGESS
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 10px 40px 30px 40px;">
                            <h1 style="margin: 0 0 16px 0; font-size: 32px; line-height: 1.15; font-weight: 800; color: #27272a; text-align: center;">
                                Simplifique a gestão da<br>
                                sua <span style="color: #3f7356;">entidade de pesca</span>
                            </h1>
                            <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #71717a; text-align: center;">
                                Chega de planilhas, cadernos e perda de tempo. O SIGESS organiza seus sócios, documentos e finanças de forma simples, segura e 100% online.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 0 40px;">
                            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                <tr><td style="border-top: 1px solid #e4e4e7;"></td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td align="left" style="padding: 30px 40px 10px 40px;">
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; color: #3f3f46;">Olá,</p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5; color: #3f3f46;">
                                Você foi convidado(a) para criar um usuário administrativo no <strong>SIGESS</strong> através do portal <a href="https://app.sigess.com.br" style="color: #059669; text-decoration: none;">app.sigess.com.br</a>.
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5; color: #3f3f46;">
                                Para aceitar o convite e definir sua senha de acesso, clique no botão abaixo:
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 0 40px 40px 40px;">
                            <table border="0" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td align="center" style="border-radius: 6px;" bgcolor="#059669">
                                        <a href="{{ .ConfirmationURL }}" target="_blank" style="font-size: 16px; font-weight: bold; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff; text-decoration: none; border-radius: 6px; padding: 14px 32px; border: 1px solid #059669; display: inline-block;">
                                            Aceitar Convite e Acessar
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 0 40px 30px 40px; background-color: #fafafa;">
                            <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #a1a1aa; padding-top: 30px;">
                                Se o botão não funcionar, copie e cole este link no seu navegador:<br>
                                <a href="{{ .ConfirmationURL }}" style="color: #059669; word-break: break-all; text-decoration: underline;">{{ .ConfirmationURL }}</a>
                            </p>
                        </td>
                    </tr>
                </table>
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px;">
                    <tr>
                        <td align="center" style="padding: 24px 20px;">
                            <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #a1a1aa;">
                                © SIGESS - Sistema de Gestão para Entidades de Pesca.<br>
                                Se você não esperava por este convite, pode ignorar este email com segurança.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

const EMAIL_RECOVERY_TEMPLATE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redefinição de Senha — SIGESS</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e4e4e7; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);">
                    <tr>
                        <td align="center" style="padding: 40px 40px 20px 40px;">
                            <div style="font-size: 20px; font-weight: 800; color: #059669; letter-spacing: 1px; display: inline-block; padding: 8px 16px; background-color: #ecfdf5; border-radius: 8px; border: 1px solid #d1fae5;">
                                SIGESS
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 10px 40px 30px 40px;">
                            <h1 style="margin: 0 0 16px 0; font-size: 32px; line-height: 1.15; font-weight: 800; color: #27272a; text-align: center;">
                                Redefinição de<br>
                                <span style="color: #3f7356;">senha de acesso</span>
                            </h1>
                            <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #71717a; text-align: center;">
                                Recebemos uma solicitação para redefinir a senha da sua conta no SIGESS. Se não foi você, ignore este email.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 0 40px;">
                            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                <tr><td style="border-top: 1px solid #e4e4e7;"></td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td align="left" style="padding: 30px 40px 10px 40px;">
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; color: #3f3f46;">Olá,</p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5; color: #3f3f46;">
                                Clique no botão abaixo para criar uma nova senha para a sua conta <strong>{{ .Email }}</strong> no SIGESS.
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5; color: #3f3f46;">
                                Este link é válido por <strong>1 hora</strong> e pode ser usado apenas uma vez.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 0 40px 40px 40px;">
                            <table border="0" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td align="center" style="border-radius: 6px;" bgcolor="#059669">
                                        <a href="{{ .ConfirmationURL }}" target="_blank" style="font-size: 16px; font-weight: bold; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff; text-decoration: none; border-radius: 6px; padding: 14px 32px; border: 1px solid #059669; display: inline-block;">
                                            Redefinir Minha Senha
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 0 40px 30px 40px; background-color: #fafafa;">
                            <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #a1a1aa; padding-top: 30px;">
                                Se o botão não funcionar, copie e cole este link no seu navegador:<br>
                                <a href="{{ .ConfirmationURL }}" style="color: #059669; word-break: break-all; text-decoration: underline;">{{ .ConfirmationURL }}</a>
                            </p>
                        </td>
                    </tr>
                </table>
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px;">
                    <tr>
                        <td align="center" style="padding: 24px 20px;">
                            <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #a1a1aa;">
                                © SIGESS - Sistema de Gestão para Entidades de Pesca.<br>
                                Se você não solicitou a redefinição de senha, ignore este email. Sua senha permanece a mesma.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STORAGE_SNAPSHOT_QUERY = `
SELECT json_build_object(
  'buckets', (
    SELECT coalesce(json_agg(
      json_build_object('id', id, 'name', name, 'public', public)
      ORDER BY name
    ), '[]'::json) FROM storage.buckets
  ),
  'policies', (
    SELECT coalesce(json_agg(
      json_build_object(
        'table', tablename,
        'name', policyname,
        'cmd', cmd,
        'roles', roles,
        'qual', qual,
        'with_check', with_check
      ) ORDER BY tablename, policyname
    ), '[]'::json)
    FROM pg_policies WHERE schemaname = 'storage'
  )
) as snapshot;
`;

const MANAGE_USER_FUNCTION_SOURCE_B64 = `aW1wb3J0IHsgc2VydmUgfSBmcm9tICJodHRwczovL2Rlbm8ubGFuZC9zdGRAMC4xNjguMC9odHRwL3NlcnZlci50cyI7CmltcG9ydCB7IGNyZWF0ZUNsaWVudCwgU3VwYWJhc2VDbGllbnQsIFVzZXIgfSBmcm9tICJodHRwczovL2VzbS5zaC9Ac3VwYWJhc2Uvc3VwYWJhc2UtanNAMiI7Cgpjb25zdCBjb3JzSGVhZGVycyA9IHsKICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLAogICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogJ2F1dGhvcml6YXRpb24sIHgtY2xpZW50LWluZm8sIGFwaWtleSwgY29udGVudC10eXBlJywKfTsKCmZ1bmN0aW9uIGpzb25SZXNwb25zZShkYXRhOiB1bmtub3duLCBzdGF0dXMgPSAyMDApOiBSZXNwb25zZSB7CiAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeShkYXRhKSwgewogICAgc3RhdHVzLAogICAgaGVhZGVyczogeyAuLi5jb3JzSGVhZGVycywgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9LAogIH0pOwp9CgovLyAtLS0tLS0tLS0tIEhhbmRsZXJzIGRlIGFjdGlvbiAtLS0tLS0tLS0tCgphc3luYyBmdW5jdGlvbiBoYW5kbGVJbnZpdGUoYWRtaW46IFN1cGFiYXNlQ2xpZW50LCBwYXlsb2FkOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KSB7CiAgY29uc3QgeyBlbWFpbCwgbm9tZSwgcm9sZSA9ICd1c2VyJywgdGVuYW50Q29kZSB9ID0gcGF5bG9hZDsKCiAgY29uc3QgYXBwT3JpZ2luID0gRGVuby5lbnYuZ2V0KCdBUFBfT1JJR0lOJykgfHwgJ2h0dHBzOi8vYXBwLnNpZ2Vzcy5jb20uYnInOwogIGNvbnN0IHJlZGlyZWN0VG8gPSB0ZW5hbnRDb2RlCiAgICA/IGAke2FwcE9yaWdpbn0vcGFzc3dvcmQ/dGVuYW50PSR7dGVuYW50Q29kZX1gCiAgICA6IGAke2FwcE9yaWdpbn0vcGFzc3dvcmRgOwoKICBjb25zb2xlLmxvZyhgW01hbmFnZVVzZXJdIENvbnZpZGFuZG8gdXN1w4PCoXJpbzogJHtlbWFpbH0gKCR7cm9sZX0pYCk7CgogIGNvbnN0IHsgZGF0YSwgZXJyb3IgfSA9IGF3YWl0IGFkbWluLmF1dGguYWRtaW4uaW52aXRlVXNlckJ5RW1haWwoZW1haWwsIHsKICAgIHJlZGlyZWN0VG8sCiAgICBkYXRhOiB7IG5vbWUsIHJvbGUgfSwKICB9KTsKICAKICBpZiAoZXJyb3IpIHsKICAgIGNvbnNvbGUuZXJyb3IoYFtNYW5hZ2VVc2VyXSBFcnJvIG5vIGludml0ZVVzZXJCeUVtYWlsOmAsIGVycm9yLm1lc3NhZ2UsIGVycm9yKTsKICAgIHRocm93IGVycm9yOwogIH0KCiAgaWYgKGRhdGEudXNlcikgewogICAgYXdhaXQgYWRtaW4uYXV0aC5hZG1pbi51cGRhdGVVc2VyQnlJZChkYXRhLnVzZXIuaWQsIHsgYXBwX21ldGFkYXRhOiB7IHJvbGUgfSB9KTsKICAgIGNvbnN0IHsgZXJyb3I6IHVwc2VydEVyciB9ID0gYXdhaXQgYWRtaW4uZnJvbSgnVXNlcicpLnVwc2VydCh7IAogICAgICBpZDogZGF0YS51c2VyLmlkLCAKICAgICAgZW1haWw6IGRhdGEudXNlci5lbWFpbCwKICAgICAgbm9tZSwgCiAgICAgIHJvbGUsIAogICAgICBhdGl2bzogdHJ1ZSAKICAgIH0sIHsgb25Db25mbGljdDogJ2lkJyB9KTsKCiAgICBpZiAodXBzZXJ0RXJyKSB7CiAgICAgIGNvbnNvbGUud2FybihgW01hbmFnZVVzZXJdIEF2aXNvOiBGYWxoYSBubyB1cHNlcnQgc2VjdW5kw4PCoXJpbyAoVXNlcik6YCwgdXBzZXJ0RXJyLm1lc3NhZ2UpOwogICAgfQogIH0KICByZXR1cm4gZGF0YTsKfQoKYXN5bmMgZnVuY3Rpb24gaGFuZGxlQ3JlYXRlKGFkbWluOiBTdXBhYmFzZUNsaWVudCwgcGF5bG9hZDogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgYm9vbGVhbj4pIHsKICBjb25zdCB7IGVtYWlsLCBwYXNzd29yZCwgbm9tZSwgcm9sZSA9ICd1c2VyJywgZW1haWxfY29uZmlybSA9IHRydWUgfSA9IHBheWxvYWQ7CgogIGNvbnN0IHsgZGF0YSwgZXJyb3IgfSA9IGF3YWl0IGFkbWluLmF1dGguYWRtaW4uY3JlYXRlVXNlcih7CiAgICBlbWFpbDogZW1haWwgYXMgc3RyaW5nLAogICAgcGFzc3dvcmQ6IHBhc3N3b3JkIGFzIHN0cmluZywKICAgIHVzZXJfbWV0YWRhdGE6IHsgbm9tZSwgcm9sZSB9LAogICAgYXBwX21ldGFkYXRhOiB7IHJvbGUgfSwKICAgIGVtYWlsX2NvbmZpcm06IGVtYWlsX2NvbmZpcm0gYXMgYm9vbGVhbiwKICB9KTsKICBpZiAoZXJyb3IpIHRocm93IGVycm9yOwoKICBpZiAoZGF0YS51c2VyKSB7CiAgICBhd2FpdCBhZG1pbi5mcm9tKCdVc2VyJykudXBzZXJ0KHsgaWQ6IGRhdGEudXNlci5pZCwgZW1haWw6IGRhdGEudXNlci5lbWFpbCwgbm9tZSwgcm9sZSwgYXRpdm86IHRydWUgfSk7CiAgfQogIHJldHVybiBkYXRhOwp9Cgphc3luYyBmdW5jdGlvbiBoYW5kbGVEZWFjdGl2YXRlKGFkbWluOiBTdXBhYmFzZUNsaWVudCwgcGF5bG9hZDogUmVjb3JkPHN0cmluZywgc3RyaW5nPikgewogIGNvbnN0IHsgdXNlcklkIH0gPSBwYXlsb2FkOwogIGNvbnN0IHsgZXJyb3I6IGF1dGhFcnJvciB9ID0gYXdhaXQgYWRtaW4uYXV0aC5hZG1pbi51cGRhdGVVc2VyQnlJZCh1c2VySWQsIHsgYmFuX2R1cmF0aW9uOiAnODc2NjAwaCcgfSk7CiAgaWYgKGF1dGhFcnJvcikgdGhyb3cgYXV0aEVycm9yOwogIGF3YWl0IGFkbWluLmZyb20oJ1VzZXInKS51cGRhdGUoeyBhdGl2bzogZmFsc2UgfSkuZXEoJ2lkJywgdXNlcklkKTsKICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAnVXN1w4PCoXJpbyBkZXNhdGl2YWRvIGUgYmFuaWRvIG5vIEF1dGgnIH07Cn0KCmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUFjdGl2YXRlKGFkbWluOiBTdXBhYmFzZUNsaWVudCwgcGF5bG9hZDogUmVjb3JkPHN0cmluZywgc3RyaW5nPikgewogIGNvbnN0IHsgdXNlcklkIH0gPSBwYXlsb2FkOwogIGNvbnN0IHsgZXJyb3I6IGF1dGhFcnJvciB9ID0gYXdhaXQgYWRtaW4uYXV0aC5hZG1pbi51cGRhdGVVc2VyQnlJZCh1c2VySWQsIHsgYmFuX2R1cmF0aW9uOiAnbm9uZScgfSk7CiAgaWYgKGF1dGhFcnJvcikgdGhyb3cgYXV0aEVycm9yOwogIGF3YWl0IGFkbWluLmZyb20oJ1VzZXInKS51cGRhdGUoeyBhdGl2bzogdHJ1ZSB9KS5lcSgnaWQnLCB1c2VySWQpOwogIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6ICdVc3XDg8KhcmlvIGF0aXZhZG8nIH07Cn0KCmFzeW5jIGZ1bmN0aW9uIGhhbmRsZURlbGV0ZShhZG1pbjogU3VwYWJhc2VDbGllbnQsIHBheWxvYWQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pIHsKICBjb25zdCB7IHVzZXJJZCB9ID0gcGF5bG9hZDsKICBpZiAoIXVzZXJJZCkgdGhyb3cgbmV3IEVycm9yKCd1c2VySWQgw6kgb2JyaWdhdMOzcmlvIHBhcmEgZXhjbHVzw6NvJyk7CiAgY29uc3QgeyBlcnJvcjogdGFibGVFcnIgfSA9IGF3YWl0IGFkbWluLmZyb20oJ1VzZXInKS5kZWxldGUoKS5lcSgnaWQnLCB1c2VySWQpOwogIGlmICh0YWJsZUVycikgY29uc29sZS53YXJuKGBbTWFuYWdlVXNlcl0gQXZpc286IGZhbGhhIGFvIHJlbW92ZXIgZGUgVXNlcjpgLCB0YWJsZUVyci5tZXNzYWdlKTsKICBjb25zdCB7IGVycm9yOiBhdXRoRXJyb3IgfSA9IGF3YWl0IGFkbWluLmF1dGguYWRtaW4uZGVsZXRlVXNlcih1c2VySWQpOwogIGlmIChhdXRoRXJyb3IpIHRocm93IGF1dGhFcnJvcjsKICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAnVXN1w6FyaW8gZXhjbHXDrWRvIHBlcm1hbmVudGVtZW50ZScgfTsKfQoKYXN5bmMgZnVuY3Rpb24gaGFuZGxlUmVzZW5kQ29uZmlybWF0aW9uKGFkbWluOiBTdXBhYmFzZUNsaWVudCwgcGF5bG9hZDogUmVjb3JkPHN0cmluZywgc3RyaW5nPikgewogIGNvbnN0IHsgZW1haWwsIHRlbmFudENvZGUgfSA9IHBheWxvYWQ7CiAgaWYgKCFlbWFpbCkgdGhyb3cgbmV3IEVycm9yKCdlbWFpbCDDqSBvYnJpZ2F0w7NyaW8gcGFyYSByZWVudmlvIGRlIGNvbmZpcm1hw6fDo28nKTsKICBjb25zdCBhcHBPcmlnaW4gPSBEZW5vLmVudi5nZXQoJ0FQUF9PUklHSU4nKSB8fCAnaHR0cHM6Ly9hcHAuc2lnZXNzLmNvbS5icic7CiAgY29uc3QgcmVkaXJlY3RUbz0gdGVuYW50Q29kZSA/IGAke2FwcE9yaWdpbn0vcGFzc3dvcmQ/dGVuYW50PSR7dGVuYW50Q29kZX1gIDogIGAke2FwcE9yaWdpbn0vcGFzc3dvcmRgOwogIGNvbnN0IHsgZXJyb3IgfSA9IGF3YWl0IGFkbWluLmF1dGguYWRtaW4uaW52aXRlVXNlckJ5RW1haWwoZW1haWwsIHsgcmVkaXJlY3RUb30pOwogIGlmIChlcnJvcikgdGhyb3cgZXJyb3I7CiAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgbWVzc2FnZTogJ0UtbWFpbCBkZSBjb25maXJtYcOnw6NvIHJlZW52aWFkbyBjb20gc3VjZXNzbycgfTsKfQoKYXN5bmMgZnVuY3Rpb24gaGFuZGxlTGlzdChhZG1pbjogU3VwYWJhc2VDbGllbnQsIGN1cnJlbnRVc2VyOiBVc2VyKSB7CiAgY29uc3QgaXNBZG1pbiA9IGN1cnJlbnRVc2VyLmFwcF9tZXRhZGF0YT8ucm9sZSA9PT0gJ2FkbWluJzsKICBsZXQgZGJRdWVyeSA9IGFkbWluLmZyb20oJ1VzZXInKS5zZWxlY3QoJyonKTsKICBpZiAoIWlzQWRtaW4pIGRiUXVlcnkgPSBkYlF1ZXJ5LmVxKCdpZCcsIGN1cnJlbnRVc2VyLmlkKTsKICBjb25zdCB7IGRhdGE6IHB1YmxpY1VzZXJzLCBlcnJvcjogZGJFcnIgfSA9IGF3YWl0IGRiUXVlcnk7CiAgaWYgKGRiRXJyKSB0aHJvdyBkYkVycjsKICBpZiAoIWlzQWRtaW4pIHsKICAgIGNvbnN0IHB1ID0gcHVibGljVXNlcnM/LlswXTsKICAgIGlmICghcHUpIHJldHVybiBbXTsKICAgIHJldHVybiBbewogICAgICBpZDogcHUuaWQsCiAgICAgIGVtYWlsOiBwdS5lbWFpbCwKICAgICAgbm9tZTogcHUubm9tZSwKICAgICAgcm9sZTogcHUucm9sZSwKICAgICAgYXRpdm86IHB1LmF0aXZvLAogICAgICBjcmVhdGVkQXQ6IHB1LmNyZWF0ZWRBdCwKICAgICAgZW1haWxDb25maXJtZWRBdDogY3VycmVudFVzZXIuZW1haWxfY29uZmlybWVkX2F0CiAgICB9XTsKICB9CiAgY29uc3QgeyBkYXRhOiB7IHVzZXJzIH0sIGVycm9yOiBhdXRoRXJyb3IgfSA9IGF3YWl0IGFkbWluLmF1dGguYWRtaW4ubGlzdFVzZXJzKHsgcGVyUGFnZTogMTAwMCB9KTsKICBpZiAoYXV0aEVycm9yKSB0aHJvdyBhdXRoRXJyb3I7CiAgcmV0dXJuIHVzZXJzLm1hcCh1ID0+IHsKICAgIGNvbnN0IHB1ID0gcHVibGljVXNlcnM/LmZpbmQocCA9PiBwLmlkID09PSB1LmlkKTsKICAgIHJldHVybiB7CiAgICAgIGlkOiB1LmlkLAogICAgICBlbWFpbDogdS5lbWFpbCwKICAgICAgbm9tZTogcHU/Lm5vbWUgfHwgdS51c2VyX21ldGFkYXRhPy5ub21lIHx8IG51bGwsCiAgICAgIHJvbGU6IHB1Py5yb2xlIHx8IHUuYXBwX21ldGFkYXRhPy5yb2xlIHx8ICd1c2VyJywKICAgICAgYXRpdm86IHB1Py5hdGl2byA/PyB0cnVlLAogICAgICBjcmVhdGVkQXQ6IHB1Py5jcmVhdGVkQXQgfHwgdS5jcmVhdGVkX2F0LAogICAgICBlbWFpbENvbmZpcm1lZEF0OiB1LmVtYWlsX2NvbmZpcm1lZF9hdAogICAgfTsKICB9KTsKfQoKY29uc3QgQUNUSU9OX0hBTkRMRVJTOiBSZWNvcmQ8c3RyaW5nLCAoYWRtaW46IFN1cGFiYXNlQ2xpZW50LCBwYXlsb2FkOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBib29sZWFuPikgPT4gUHJvbWlzZTx1bmtub3duPj4gPSB7CiAgaW52aXRlOiBoYW5kbGVJbnZpdGUsCiAgY3JlYXRlOiBoYW5kbGVDcmVhdGUsCiAgZGVhY3RpdmF0ZTogaGFuZGxlRGVhY3RpdmF0ZSwKICBhY3RpdmF0ZTogaGFuZGxlQWN0aXZhdGUsCiAgZGVsZXRlOiBoYW5kbGVEZWxldGUsCiAgcmVzZW5kX2NvbmZpcm1hdGlvbjogaGFuZGxlUmVzZW5kQ29uZmlybWF0aW9uLAogIGxpc3Q6IGhhbmRsZUxpc3QsCiAgdG9nZ2xlVXNlclN0YXR1czogKGFkbWluLCBwYXlsb2FkKSA9PiB7CiAgICBjb25zdCBpc0FjdGl2ZSA9IHBheWxvYWQuYXRpdm8gIT09IHVuZGVmaW5lZCA/IHBheWxvYWQuYXRpdm8gOiBwYXlsb2FkLmlzQWN0aXZlOwogICAgcmV0dXJuIGlzQWN0aXZlID8gaGFuZGxlRGVhY3RpdmF0ZShhZG1pbiwgcGF5bG9hZCkgOiBoYW5kbGVBY3RpdmF0ZShhZG1pbiwgcGF5bG9hZCk7CiAgfSwKfTsKCnNlcnZlKGFzeW5jIChyZXE6IFJlcXVlc3QpID0+IHsKICBpZiAocmVxLm1ldGhvZCA9PT0gJ09QVElPTlMnKSB7CiAgICByZXR1cm4gbmV3IFJlc3BvbnNlKCdvaycsIHsgaGVhZGVyczogY29yc0hlYWRlcnMgfSk7CiAgfQoKICB0cnkgewogICAgY29uc3QgYXV0aEhlYWRlciA9IHJlcS5oZWFkZXJzLmdldCgnQXV0aG9yaXphdGlvbicpOwogICAgaWYgKCFhdXRoSGVhZGVyKSB0aHJvdyBuZXcgRXJyb3IoJ1NlbSBjYWJlw6dhbGhvIGRlIGF1dG9yaXphw6fDo28nKTsKICAgIGNvbnN0IHN1cGFiYXNlVXJsID0gRGVuby5lbnYuZ2V0KCdTVVBBQkFTRV9VUkwnKSB8fCAnJzsKICAgIGNvbnN0IHN1cGFiYXNlU2VydmljZUtleSA9IERlbm8uZW52LmdldCgnU1VQQUJBU0VfU0VSVklDRV9ST0xFX0tFWScpIHx8ICcnOwogICAgY29uc3Qgc3VwYWJhc2VBZG1pbiA9IGNyZWF0ZUNsaWVudChzdXBhYmFzZVVybCwgc3VwYWJhc2VTZXJ2aWNlS2V5LCB7IGF1dGg6IHsgYXV0b1JlZnJlc2hUb2tlbjogZmFsc2UsIHBlcnNpc3RTZXNzaW9uOiBmYWxzZSB9IH0pOwogICAgY29uc3QgdG9rZW4gPSBhdXRoSGVhZGVyLnJlcGxhY2UoJ0JlYXJlciAnLCAnJyk7CiAgICBjb25zdCB7IGRhdGE6IHsgdXNlciB9LCBlcnJvcjogYXV0aEVyciB9ID0gYXdhaXQgc3VwYWJhc2VBZG1pbi5hdXRoLmdldFVzZXIodG9rZW4pOwogICAgaWYgKGF1dGhFcnIgfHwgIXVzZXIpIHRocm93IG5ldyBFcnJvcignQWNlc3NvIG7Do28gYXV0b3JpemFkbyBvdSB0b2tlbiBleHBpcmFkby4nKTsKICAgIGNvbnN0IHsgYWN0aW9uLCBwYXlsb2FkIH0gPSBhd2FpdCByZXEuanNvbigpOwogICAgaWYgKHVzZXIuYXBwX21ldGFkYXRhPy5yb2xlICE9PSAnYWRtaW4nICYmIGFjdGlvbiAhPT0gJ2xpc3QnKSB7CiAgICAgIHJldHVybiBqc29uUmVzcG9uc2UoeyBlcnJvcjogJ09wZXJhw6fDo28gcmVzdHJpdGEgYSBQcmVzaWRlbnRlcyAoYWRtaW4pLicgfSwgNDAzKTsKICAgIH0KICAgIGNvbnN0IGhhbmRsZXIgPSBBQ1RJT05fSEFORExFUlNbYWN0aW9uXTsKICAgIGlmICghaGFuZGxlcikgdGhyb3cgbmV3IEVycm9yKGBBw6fDo28gJyR7YWN0aW9ufScgZGVzY29uaGVjaWRhLmApOwogICAgY29uc3QgcmVzdWx0ID0gYWN0aW9uID09PSAnbGlzdCcgPyBhd2FpdCBoYW5kbGVMaXN0KHN1cGFiYXNlQWRtaW4sIHVzZXIpIDogYXdhaXQgaGFuZGxlcihzdXBhYmFzZUFkbWluLCBwYXlsb2FkKTsKICAgIHJldHVybiBqc29uUmVzcG9uc2UocmVzdWx0KTsKICB9IGNhdGNoIChlcnJvcikgewogICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ0Vycm8gZGVzY29uaGVjaWRvJzsKICAgIGNvbnN0IHN0YXR1cyA9IG1lc3NhZ2UuaW5jbHVkZXMoJ2F1dGhvcml6ZWQnKSA/IDQwMSA6IDQwMDsKICAgIHJldHVybiBqc29uUmVzcG9uc2UoeyBlcnJvcjogbWVzc2FnZSB9LCBzdGF0dXMpOwogIH0KfSk7`;

interface OnboardingPayload {
  tenantCode: string;
  tenantLabel: string;
  projectRef: string;
  adminEmail?: string;
  supabaseAccountId: string;
}

interface SystemSetting {
  key: string;
  value: string;
}

interface SupabaseApiKey {
  name: string;
  api_key: string;
}

interface StorageBucketDef {
  id: string;
  name: string;
  public: boolean;
}

interface StoragePolicyDef {
  table: string;
  name: string;
  cmd: string;
  roles: string[] | string | null;
  qual: string | null;
  with_check: string | null;
}

// Ensure global type definition for EdgeRuntime and Deno are present
declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };
declare const Deno: { env: { get(key: string): string | undefined } };

serve(async (req: Request) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: corsHeaders }); }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) throw new Error("Unauthorized: Invalid admin token");

    const payload: OnboardingPayload = await req.json();
    if (!payload.tenantCode || !payload.tenantLabel || !payload.projectRef || !payload.supabaseAccountId) {
      throw new Error("Missing required payload fields");
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from("onboarding_jobs")
      .insert({
        tenant_code: payload.tenantCode,
        tenant_label: payload.tenantLabel,
        project_ref: payload.projectRef,
        admin_email: payload.adminEmail || null,
        supabase_account_id: payload.supabaseAccountId,
        status: "pending",
        current_step: 0,
        total_steps: 9
      })
      .select("id")
      .single();

    if (jobError || !job) throw new Error("Failed to initialize job: " + (jobError ? jobError.message : ""));
    EdgeRuntime.waitUntil(processOnboarding(job.id, payload, supabaseAdmin));

    return new Response(JSON.stringify({ jobId: job.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 202,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function updateJob(
  supabaseAdmin: SupabaseClient,
  jobId: string,
  status: string,
  stepIncrement: number = 0,
  error_detail?: string,
  entidadeId?: string
) {
  const updates: Record<string, any> = { status };
  if (error_detail) updates.error_detail = error_detail;
  if (entidadeId) updates.entidade_id = entidadeId;
  if (['completed', 'failed'].includes(status)) updates.completed_at = new Date().toISOString();

  if (stepIncrement > 0) {
    const { data } = await supabaseAdmin.from('onboarding_jobs').select('current_step').eq('id', jobId).single();
    if (data) updates.current_step = (data.current_step || 0) + stepIncrement;
  }
  await supabaseAdmin.from('onboarding_jobs').update(updates).eq('id', jobId);
}

// --- Main background processing ---
async function processOnboarding(jobId: string, payload: OnboardingPayload, supabaseAdmin: SupabaseClient) {
  try {
    const { projectRef, tenantCode, tenantLabel, adminEmail, supabaseAccountId } = payload;
    const projectUrl = `https://${projectRef}.supabase.co`;

    const { data: settingsData } = await supabaseAdmin.from("system_settings").select("key, value");
    const sysConfig = Object.fromEntries((settingsData as SystemSetting[] || []).map((s: SystemSetting) => [s.key, s.value]));

    const { data: accountData, error: accountErr } = await supabaseAdmin
      .from("supabase_accounts").select("management_token").eq("id", supabaseAccountId).single();
    if (accountErr || !accountData) throw new Error("Falha ao carregar conta Supabase: " + (accountErr ? accountErr.message : ""));

    const resendApiKey = sysConfig.resend_api_key || Deno.env.get("RESEND_API_KEY");
    const managementToken = accountData.management_token;

    if (!managementToken || !resendApiKey) {
      throw new Error("Configuracoes incompletas (Supabase ou Resend ausentes).");
    }

    // 1. Keys
    await updateJob(supabaseAdmin, jobId, "fetching_keys", 1);
    const { anonKey, serviceRoleKey } = await fetchProjectKeys(projectRef, managementToken);

    // 2. Auth & SMTP
    await updateJob(supabaseAdmin, jobId, "configuring_auth", 1);
    await setupProjectAuth(projectRef, managementToken, resendApiKey, sysConfig.resend_from_email);

    // 3. Database (Migrations & Seed)
    await updateJob(supabaseAdmin, jobId, "running_migrations", 1);
    await runProjectMigrations(projectRef, managementToken, supabaseAdmin);

    await updateJob(supabaseAdmin, jobId, "configuring_storage", 1);
    await syncProjectStorage(projectRef, projectUrl, serviceRoleKey, managementToken, supabaseAdmin);

    await updateJob(supabaseAdmin, jobId, "deploying_edge_functions", 1);
    await deployProjectEdgeFunctions(projectRef, managementToken);

    // 4. Admin User
    if (adminEmail) {
      await updateJob(supabaseAdmin, jobId, "creating_admin", 1);
      const tempPass = sysConfig.default_admin_password || Deno.env.get("DEFAULT_ADMIN_PASSWORD") || "Mudar@12345";
      await createAdminUser(projectUrl, serviceRoleKey, adminEmail, tempPass);
    } else {
      // Pular passo do admin se não fornecido para manter contagem consistente
      await updateJob(supabaseAdmin, jobId, "creating_admin", 1);
    }

    // 5. Registration
    await updateJob(supabaseAdmin, jobId, "registering_tenant", 1);
    const entidadeId = await registerTenantInCentral(supabaseAdmin, tenantLabel, tenantCode, projectUrl, anonKey, serviceRoleKey, managementToken);

    // 6. Finalization
    await updateJob(supabaseAdmin, jobId, "finalizing_setup", 1, undefined, entidadeId);
    await supabaseAdmin.rpc('increment_active_projects', { account_id: supabaseAccountId });

    // 7. Finalização
    await updateJob(supabaseAdmin, jobId, "completed", 1);
  } catch (error) {
    console.error(`[Job ${jobId}] Failed:`, error);
    await updateJob(supabaseAdmin, jobId, "failed", 0, error instanceof Error ? error.message : String(error));
  }
}

// --- Helper Functions to keep complexity low ---

async function fetchProjectKeys(projectRef: string, token: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Fetch Keys error: ${await res.text()}`);
  const keys: SupabaseApiKey[] = await res.json();
  
  const publishableEntry = keys.find((k) => k.api_key.startsWith("sb_publishable_"));
  const pubKey = publishableEntry ? publishableEntry.api_key : undefined;
  const anonEntry = keys.find((k) => k.name === "anon");
  const anonKey = pubKey || (anonEntry ? anonEntry.api_key : undefined);
  const serviceRoleEntry = keys.find((k) => k.name === "service_role");
  const serviceRoleKey = serviceRoleEntry ? serviceRoleEntry.api_key : undefined;
  
  if (!anonKey || !serviceRoleKey) throw new Error("Chaves de API (anon/publishable ou service_role) ausentes.");
  return { anonKey, serviceRoleKey };
}

async function setupProjectAuth(projectRef: string, token: string, resendKey: string, fromEmail?: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      site_url: "https://app.sigess.com.br/password",
      uri_allow_list: "https://app.sigess.com.br/**,https://app.sigess.com.br/password",
      smtp_admin_email: fromEmail || "noreply@sigess.com.br",
      smtp_host: "smtp.resend.com", smtp_port: "465", smtp_user: "resend", smtp_pass: resendKey,
      smtp_sender_name: "SIGESS", smtp_enabled: true,
      mailer_subjects_invite: "Convite para acessar o SIGESS",
      mailer_templates_invite_content: EMAIL_INVITE_TEMPLATE,
      mailer_subjects_recovery: "Redefina sua senha no SIGESS",
      mailer_templates_recovery_content: EMAIL_RECOVERY_TEMPLATE,
    }),
  });
  if (!res.ok) throw new Error(`Config Auth error: ${await res.text()}`);
}

async function fetchSqlFromStorage(supabaseAdmin: SupabaseClient, filename: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage.from('migrations').download(filename);
  if (error || !data) throw new Error("Storage fetch failed for " + filename + ": " + (error ? error.message : ""));
  return new TextDecoder('utf-8').decode(await data.arrayBuffer());
}

function sanitizeInitialSchemaSql(sql: string) {
  const cleanedSql = sql
    .replace(/^CREATE SCHEMA public;\s*$/gim, "")
    .replace(/^CREATE SCHEMA IF NOT EXISTS public;\s*$/gim, "")
    .replace(/^ALTER SCHEMA public OWNER TO .*?;\s*$/gim, "")
    .replace(/^COMMENT ON SCHEMA public IS .*?;\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const needsPgTrgm =
    cleanedSql.includes("public.gin_trgm_ops") &&
    !/CREATE EXTENSION IF NOT EXISTS pg_trgm/i.test(cleanedSql);

  if (!needsPgTrgm) {
    return cleanedSql;
  }

  return `CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;\n\n${cleanedSql}`;
}

async function runProjectMigrations(projectRef: string, accessToken: string, supabaseAdmin: SupabaseClient) {
  const queryApiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  const runQuery = async (query: string) => {
    const res = await fetch(queryApiUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`Management API error: ${err.message || res.statusText}`);
    }
  };

  const initialSchema = sanitizeInitialSchemaSql(
    await fetchSqlFromStorage(supabaseAdmin, 'initial_schema.sql')
  );
  await runQuery(initialSchema);

  const seed = await fetchSqlFromStorage(supabaseAdmin, 'seed.sql');
  await runQuery(seed);

  return { success: true };
}

function escapeLiteral(value: string) {
  return value.replace(/'/g, "''");
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function normalizeRoles(roles: string[] | string | null | undefined) {
  if (Array.isArray(roles)) return roles.filter(Boolean);
  if (typeof roles === "string" && roles.trim().length > 0) return [roles];
  return [];
}

function roleToSql(role: string) {
  return role === "public" ? "PUBLIC" : quoteIdentifier(role);
}

async function runManagementQuery(projectRef: string, accessToken: string, query: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(`Management API error: ${err.message || res.statusText}`);
  }

  return await res.json();
}

async function fetchOeirasStorageBlueprint(supabaseAdmin: SupabaseClient) {
  const { data: oeiras, error } = await supabaseAdmin
    .from("entidades")
    .select("supabase_url, supabase_access_token")
    .eq("tenant_code", "sinpesca-oeiras")
    .single();

  if (error || !oeiras?.supabase_access_token || !oeiras.supabase_url) {
    throw new Error("Falha ao carregar blueprint de storage do Oeiras.");
  }

  const projectRef = new URL(oeiras.supabase_url).hostname.split(".")[0];
  const rows = await runManagementQuery(projectRef, oeiras.supabase_access_token, STORAGE_SNAPSHOT_QUERY);
  return rows?.[0]?.snapshot as { buckets?: StorageBucketDef[]; policies?: StoragePolicyDef[] } | undefined;
}

function buildStoragePolicySql(policy: StoragePolicyDef) {
  const qualifiedTable = `storage.${quoteIdentifier(policy.table)}`;
  const dropSql = `DROP POLICY IF EXISTS ${quoteIdentifier(policy.name)} ON ${qualifiedTable};`;
  const cmd = typeof policy.cmd === "string" && policy.cmd.length > 0 ? policy.cmd.toUpperCase() : "ALL";
  const roles = normalizeRoles(policy.roles);
  const createParts = [
    `CREATE POLICY ${quoteIdentifier(policy.name)} ON ${qualifiedTable}`,
    `FOR ${cmd}`,
  ];

  if (roles.length > 0) {
    createParts.push(`TO ${roles.map(roleToSql).join(", ")}`);
  }

  if (policy.qual) {
    createParts.push(`USING (${policy.qual})`);
  }

  if (policy.with_check) {
    createParts.push(`WITH CHECK (${policy.with_check})`);
  }

  return [dropSql, `${createParts.join(" ")};`].join("\n");
}

async function syncProjectStorage(
  projectRef: string,
  projectUrl: string,
  serviceRoleKey: string,
  accessToken: string,
  supabaseAdmin: SupabaseClient,
) {
  const blueprint = await fetchOeirasStorageBlueprint(supabaseAdmin);
  const targetClient = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const bucket of blueprint?.buckets || []) {
    const { error } = await targetClient.storage.createBucket(bucket.id, { public: bucket.public });
    if (error && !/already exists/i.test(error.message)) {
      throw error;
    }
  }

  const policiesSql = (blueprint?.policies || []).map(buildStoragePolicySql).join("\n\n").trim();
  if (policiesSql) {
    await runManagementQuery(projectRef, accessToken, policiesSql);
  }
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function deployManageUserFunction(projectRef: string, accessToken: string) {
  const zip = new JSZip();
  zip.file("index.ts", decodeBase64Utf8(MANAGE_USER_FUNCTION_SOURCE_B64));

  const archive = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });

  const form = new FormData();
  form.append("file", new Blob([archive], { type: "application/zip" }), "manage-user.zip");
  form.append("metadata", JSON.stringify({
    name: "manage-user",
    entrypoint_path: "index.ts",
    verify_jwt: false,
  }));

  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/functions/deploy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Deploy manage-user error: ${await res.text()}`);
  }
}

async function deployProjectEdgeFunctions(projectRef: string, accessToken: string) {
  await deployManageUserFunction(projectRef, accessToken);
}

async function createAdminUser(url: string, key: string, email: string, pass: string) {
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: authError } = await client.auth.admin.createUser({ email, password: pass, email_confirm: true });
  if (authError && !authError.message.includes("already exists")) throw authError;

  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const { data: publicUser } = await client.from("User").select("id").eq("email", email).single();
    if (publicUser) {
      await client.from("User").update({ role: "admin" }).eq("id", publicUser.id);
      break;
    }
  }
}

async function registerTenantInCentral(admin: SupabaseClient, label: string, code: string, url: string, anon: string, sr: string, pat: string) {
  const { data: existing } = await admin.from('entidades').select('id').eq('tenant_code', code.toLowerCase()).single();
  if (existing) return existing.id;

  const { data: tenant, error } = await admin.from('entidades').insert({
    nome_entidade: label, tenant_code: code.toLowerCase(), supabase_url: url,
    supabase_publishable_key: anon, supabase_secret_keys: sr, supabase_access_token: pat, assinatura: 'anual'
  }).select('id').single();
  if (error || !tenant) throw new Error("Failed to register tenant: " + (error ? error.message : ""));

  // O monitoramento de schema agora é feito via observability (schema_sync_status)
  return tenant.id;
}
