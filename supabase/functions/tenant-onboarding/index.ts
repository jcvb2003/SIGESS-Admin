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

const MANAGE_USER_FUNCTION_SOURCE_B64 = `aW1wb3J0IHsgc2VydmUgfSBmcm9tICJodHRwczovL2Rlbm8ubGFuZC9zdGRAMC4xNjguMC9odHRwL3NlcnZlci50cyI7CmltcG9ydCB7IGNyZWF0ZUNsaWVudCwgU3VwYWJhc2VDbGllbnQsIFVzZXIgfSBmcm9tICJodHRwczovL2VzbS5zaC9Ac3VwYWJhc2Uvc3VwYWJhc2UtanNAMiI7Cgpjb25zdCBjb3JzSGVhZGVycyA9IHsKICAiQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luIjogIioiLAogICJBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzIjogImF1dGhvcml6YXRpb24sIHgtY2xpZW50LWluZm8sIGFwaWtleSwgY29udGVudC10eXBlIiwKfTsKCmZ1bmN0aW9uIGpzb25SZXNwb25zZShkYXRhOiB1bmtub3duLCBzdGF0dXMgPSAyMDApOiBSZXNwb25zZSB7CiAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeShkYXRhKSwgewogICAgc3RhdHVzLAogICAgaGVhZGVyczogeyAuLi5jb3JzSGVhZGVycywgIkNvbnRlbnQtVHlwZSI6ICJhcHBsaWNhdGlvbi9qc29uIiB9LAogIH0pOwp9Cgp0eXBlIFRlbmFudFJvbGUgPSAib3duZXIiIHwgIm1lbWJlciI7CgppbnRlcmZhY2UgQWNjZXNzU2NvcGUgewogIG1vZGU6ICJpc29sYXRlZCIgfCAic2hhcmVkIjsKICBpc0FkbWluOiBib29sZWFuOwogIHRlbmFudElkOiBzdHJpbmcgfCBudWxsOwogIHRlbmFudFJvbGU6IFRlbmFudFJvbGUgfCBudWxsOwogIHVuaXRJZHM6IHN0cmluZ1tdOwp9CgpmdW5jdGlvbiBpc01pc3NpbmdTaGFyZWRTY2hlbWFFcnJvcihlcnJvcjogdW5rbm93bikgewogIGlmICghZXJyb3IgfHwgdHlwZW9mIGVycm9yICE9PSAib2JqZWN0IikgcmV0dXJuIGZhbHNlOwogIGNvbnN0IGNhbmRpZGF0ZSA9IGVycm9yIGFzIHsgY29kZT86IHN0cmluZzsgbWVzc2FnZT86IHN0cmluZzsgc3RhdHVzPzogbnVtYmVyIH07CiAgY29uc3QgY29kZSA9IFN0cmluZyhjYW5kaWRhdGUuY29kZSA/PyAiIik7CiAgY29uc3QgbWVzc2FnZSA9IFN0cmluZyhjYW5kaWRhdGUubWVzc2FnZSA/PyAiIik7CiAgcmV0dXJuICgKICAgIGNhbmRpZGF0ZS5zdGF0dXMgPT09IDQwNCB8fAogICAgY29kZSA9PT0gIjQyUDAxIiB8fAogICAgY29kZSA9PT0gIlBHUlNUMjA1IiB8fAogICAgbWVzc2FnZS5pbmNsdWRlcygidGVuYW50X3VzZXJzIikgfHwKICAgIG1lc3NhZ2UuaW5jbHVkZXMoInVzZXJfdW5pdF9tZW1iZXJzaGlwcyIpCiAgKTsKfQoKYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZUFjY2Vzc1Njb3BlKGFkbWluOiBTdXBhYmFzZUNsaWVudCwgY3VycmVudFVzZXI6IFVzZXIpOiBQcm9taXNlPEFjY2Vzc1Njb3BlPiB7CiAgY29uc3QgaXNBZG1pbiA9IGN1cnJlbnRVc2VyLmFwcF9tZXRhZGF0YT8ucm9sZSA9PT0gImFkbWluIjsKCiAgY29uc3QgeyBkYXRhOiB0ZW5hbnRVc2VyLCBlcnJvcjogdGVuYW50VXNlckVycm9yIH0gPSBhd2FpdCBhZG1pbgogICAgLmZyb20oInRlbmFudF91c2VycyIpCiAgICAuc2VsZWN0KCJ0ZW5hbnRfaWQsIHRlbmFudF9yb2xlIikKICAgIC5lcSgidXNlcl9pZCIsIGN1cnJlbnRVc2VyLmlkKQogICAgLmVxKCJpc19hY3RpdmUiLCB0cnVlKQogICAgLmxpbWl0KDEpCiAgICAubWF5YmVTaW5nbGUoKTsKCiAgaWYgKHRlbmFudFVzZXJFcnJvcikgewogICAgaWYgKGlzTWlzc2luZ1NoYXJlZFNjaGVtYUVycm9yKHRlbmFudFVzZXJFcnJvcikpIHsKICAgICAgcmV0dXJuIHsgbW9kZTogImlzb2xhdGVkIiwgaXNBZG1pbiwgdGVuYW50SWQ6IG51bGwsIHRlbmFudFJvbGU6IG51bGwsIHVuaXRJZHM6IFtdIH07CiAgICB9CiAgICB0aHJvdyB0ZW5hbnRVc2VyRXJyb3I7CiAgfQoKICBjb25zdCB0ZW5hbnRJZCA9ICh0ZW5hbnRVc2VyIGFzIHsgdGVuYW50X2lkPzogc3RyaW5nIHwgbnVsbCB9IHwgbnVsbCk/LnRlbmFudF9pZCA/PyBudWxsOwogIGNvbnN0IHRlbmFudFJvbGUgPSAoKHRlbmFudFVzZXIgYXMgeyB0ZW5hbnRfcm9sZT86IFRlbmFudFJvbGUgfCBudWxsIH0gfCBudWxsKT8udGVuYW50X3JvbGUgPz8gbnVsbCkgYXMgVGVuYW50Um9sZSB8IG51bGw7CgogIGlmICghdGVuYW50SWQgfHwgIXRlbmFudFJvbGUpIHsKICAgIHJldHVybiB7IG1vZGU6ICJpc29sYXRlZCIsIGlzQWRtaW4sIHRlbmFudElkOiBudWxsLCB0ZW5hbnRSb2xlOiBudWxsLCB1bml0SWRzOiBbXSB9OwogIH0KCiAgaWYgKHRlbmFudFJvbGUgPT09ICJvd25lciIpIHsKICAgIHJldHVybiB7IG1vZGU6ICJzaGFyZWQiLCBpc0FkbWluLCB0ZW5hbnRJZCwgdGVuYW50Um9sZSwgdW5pdElkczogW10gfTsKICB9CgogIGNvbnN0IHsgZGF0YTogbWVtYmVyc2hpcHMsIGVycm9yOiBtZW1iZXJzaGlwc0Vycm9yIH0gPSBhd2FpdCBhZG1pbgogICAgLmZyb20oInVzZXJfdW5pdF9tZW1iZXJzaGlwcyIpCiAgICAuc2VsZWN0KCJ1bml0X2lkIikKICAgIC5lcSgidGVuYW50X2lkIiwgdGVuYW50SWQpCiAgICAuZXEoInVzZXJfaWQiLCBjdXJyZW50VXNlci5pZCkKICAgIC5lcSgiaXNfYWN0aXZlIiwgdHJ1ZSk7CgogIGlmIChtZW1iZXJzaGlwc0Vycm9yKSB7CiAgICBpZiAoaXNNaXNzaW5nU2hhcmVkU2NoZW1hRXJyb3IobWVtYmVyc2hpcHNFcnJvcikpIHsKICAgICAgcmV0dXJuIHsgbW9kZTogInNoYXJlZCIsIGlzQWRtaW4sIHRlbmFudElkLCB0ZW5hbnRSb2xlLCB1bml0SWRzOiBbXSB9OwogICAgfQogICAgdGhyb3cgbWVtYmVyc2hpcHNFcnJvcjsKICB9CgogIHJldHVybiB7CiAgICBtb2RlOiAic2hhcmVkIiwKICAgIGlzQWRtaW4sCiAgICB0ZW5hbnRJZCwKICAgIHRlbmFudFJvbGUsCiAgICB1bml0SWRzOiAobWVtYmVyc2hpcHMgPz8gW10pCiAgICAgIC5tYXAoKHJvdykgPT4gKHJvdyBhcyB7IHVuaXRfaWQ/OiBzdHJpbmcgfCBudWxsIH0pLnVuaXRfaWQpCiAgICAgIC5maWx0ZXIoKHZhbHVlKTogdmFsdWUgaXMgc3RyaW5nID0+IEJvb2xlYW4odmFsdWUpKSwKICB9Owp9CgpmdW5jdGlvbiBjYW5NYW5hZ2VPdGhlclVzZXJzKHNjb3BlOiBBY2Nlc3NTY29wZSkgewogIHJldHVybiBzY29wZS5pc0FkbWluOwp9CgpmdW5jdGlvbiBjYW5WaWV3QWxsVXNlcnMoc2NvcGU6IEFjY2Vzc1Njb3BlKSB7CiAgaWYgKHNjb3BlLm1vZGUgPT09ICJzaGFyZWQiKSB7CiAgICByZXR1cm4gc2NvcGUudGVuYW50Um9sZSA9PT0gIm93bmVyIjsKICB9CiAgcmV0dXJuIHNjb3BlLmlzQWRtaW47Cn0KCmFzeW5jIGZ1bmN0aW9uIGxpc3RTaGFyZWRBbGxvd2VkSWRzKAogIGFkbWluOiBTdXBhYmFzZUNsaWVudCwKICBzY29wZTogQWNjZXNzU2NvcGUsCiAgY3VycmVudFVzZXI6IFVzZXIsCiAgYWN0aXZlVW5pdElkPzogc3RyaW5nIHwgbnVsbCwKKSB7CiAgaWYgKCFzY29wZS50ZW5hbnRJZCkgewogICAgcmV0dXJuIFtjdXJyZW50VXNlci5pZF07CiAgfQoKICBpZiAoc2NvcGUudGVuYW50Um9sZSA9PT0gIm93bmVyIikgewogICAgaWYgKGFjdGl2ZVVuaXRJZCkgewogICAgICBjb25zdCB7IGRhdGE6IG1lbWJlcnNoaXBzLCBlcnJvciB9ID0gYXdhaXQgYWRtaW4KICAgICAgICAuZnJvbSgidXNlcl91bml0X21lbWJlcnNoaXBzIikKICAgICAgICAuc2VsZWN0KCJ1c2VyX2lkIikKICAgICAgICAuZXEoInRlbmFudF9pZCIsIHNjb3BlLnRlbmFudElkKQogICAgICAgIC5lcSgiaXNfYWN0aXZlIiwgdHJ1ZSkKICAgICAgICAuZXEoInVuaXRfaWQiLCBhY3RpdmVVbml0SWQpOwoKICAgICAgaWYgKGVycm9yKSB0aHJvdyBlcnJvcjsKCiAgICAgIHJldHVybiBBcnJheS5mcm9tKAogICAgICAgIG5ldyBTZXQoCiAgICAgICAgICAobWVtYmVyc2hpcHMgPz8gW10pCiAgICAgICAgICAgIC5tYXAoKHJvdykgPT4gKHJvdyBhcyB7IHVzZXJfaWQ/OiBzdHJpbmcgfCBudWxsIH0pLnVzZXJfaWQpCiAgICAgICAgICAgIC5maWx0ZXIoKHZhbHVlKTogdmFsdWUgaXMgc3RyaW5nID0+IEJvb2xlYW4odmFsdWUpKQogICAgICAgICAgICAuY29uY2F0KGN1cnJlbnRVc2VyLmlkKSwKICAgICAgICApLAogICAgICApOwogICAgfQoKICAgIGNvbnN0IHsgZGF0YTogdGVuYW50VXNlcnMsIGVycm9yIH0gPSBhd2FpdCBhZG1pbgogICAgICAuZnJvbSgidGVuYW50X3VzZXJzIikKICAgICAgLnNlbGVjdCgidXNlcl9pZCIpCiAgICAgIC5lcSgidGVuYW50X2lkIiwgc2NvcGUudGVuYW50SWQpCiAgICAgIC5lcSgiaXNfYWN0aXZlIiwgdHJ1ZSk7CgogICAgaWYgKGVycm9yKSB0aHJvdyBlcnJvcjsKCiAgICByZXR1cm4gQXJyYXkuZnJvbSgKICAgICAgbmV3IFNldCgKICAgICAgICAodGVuYW50VXNlcnMgPz8gW10pCiAgICAgICAgICAubWFwKChyb3cpID0+IChyb3cgYXMgeyB1c2VyX2lkPzogc3RyaW5nIHwgbnVsbCB9KS51c2VyX2lkKQogICAgICAgICAgLmZpbHRlcigodmFsdWUpOiB2YWx1ZSBpcyBzdHJpbmcgPT4gQm9vbGVhbih2YWx1ZSkpLAogICAgICApLAogICAgKTsKICB9CgogIGlmIChzY29wZS51bml0SWRzLmxlbmd0aCA9PT0gMCkgewogICAgcmV0dXJuIFtjdXJyZW50VXNlci5pZF07CiAgfQoKICBjb25zdCBmaWx0ZXJlZFVuaXRJZHMgPQogICAgYWN0aXZlVW5pdElkICYmIHNjb3BlLnVuaXRJZHMuaW5jbHVkZXMoYWN0aXZlVW5pdElkKQogICAgICA/IFthY3RpdmVVbml0SWRdCiAgICAgIDogc2NvcGUudW5pdElkczsKCiAgY29uc3QgeyBkYXRhOiBtZW1iZXJzaGlwcywgZXJyb3IgfSA9IGF3YWl0IGFkbWluCiAgICAuZnJvbSgidXNlcl91bml0X21lbWJlcnNoaXBzIikKICAgIC5zZWxlY3QoInVzZXJfaWQiKQogICAgLmVxKCJ0ZW5hbnRfaWQiLCBzY29wZS50ZW5hbnRJZCkKICAgIC5lcSgiaXNfYWN0aXZlIiwgdHJ1ZSkKICAgIC5pbigidW5pdF9pZCIsIGZpbHRlcmVkVW5pdElkcyk7CgogIGlmIChlcnJvcikgdGhyb3cgZXJyb3I7CgogIHJldHVybiBBcnJheS5mcm9tKAogICAgbmV3IFNldCgKICAgICAgKG1lbWJlcnNoaXBzID8/IFtdKQogICAgICAgIC5tYXAoKHJvdykgPT4gKHJvdyBhcyB7IHVzZXJfaWQ/OiBzdHJpbmcgfCBudWxsIH0pLnVzZXJfaWQpCiAgICAgICAgLmZpbHRlcigodmFsdWUpOiB2YWx1ZSBpcyBzdHJpbmcgPT4gQm9vbGVhbih2YWx1ZSkpCiAgICAgICAgLmNvbmNhdChjdXJyZW50VXNlci5pZCksCiAgICApLAogICk7Cn0KCmFzeW5jIGZ1bmN0aW9uIGF0dGFjaFVzZXJUb1NoYXJlZFNjb3BlKAogIGFkbWluOiBTdXBhYmFzZUNsaWVudCwKICBzY29wZTogQWNjZXNzU2NvcGUsCiAgY3VycmVudFVzZXI6IFVzZXIsCiAgY3JlYXRlZFVzZXJJZDogc3RyaW5nLAogIHJvbGU6IHN0cmluZywKICBhY3RpdmVVbml0SWQ/OiBzdHJpbmcgfCBudWxsLAopIHsKICBpZiAoc2NvcGUubW9kZSAhPT0gInNoYXJlZCIgfHwgIXNjb3BlLnRlbmFudElkKSB7CiAgICByZXR1cm47CiAgfQoKICBpZiAoIWFjdGl2ZVVuaXRJZCkgewogICAgdGhyb3cgbmV3IEVycm9yKCJQb2xvIGF0aXZvIG9icmlnYXTDs3JpbyBwYXJhIGNhZGFzdHJhciB1c3XDoXJpb3MgbmVzdGUgY29udGV4dG8uIik7CiAgfQoKICBpZiAoc2NvcGUudGVuYW50Um9sZSAhPT0gIm93bmVyIiAmJiAhc2NvcGUudW5pdElkcy5pbmNsdWRlcyhhY3RpdmVVbml0SWQpKSB7CiAgICB0aHJvdyBuZXcgRXJyb3IoIlBvbG8gZm9yYSBkbyBlc2NvcG8gZG8gdXN1w6FyaW8gYXR1YWwuIik7CiAgfQoKICBjb25zdCBvcGVyYXRvclR5cGUgPSByb2xlID09PSAiYWRtaW4iID8gInByZXNpZGVudGUiIDogImF1eGlsaWFyIjsKCiAgY29uc3QgeyBlcnJvcjogdGVuYW50VXNlckVycm9yIH0gPSBhd2FpdCBhZG1pbgogICAgLmZyb20oInRlbmFudF91c2VycyIpCiAgICAudXBzZXJ0KAogICAgICB7CiAgICAgICAgdGVuYW50X2lkOiBzY29wZS50ZW5hbnRJZCwKICAgICAgICB1c2VyX2lkOiBjcmVhdGVkVXNlcklkLAogICAgICAgIHRlbmFudF9yb2xlOiAibWVtYmVyIiwKICAgICAgICBvcGVyYXRvcl90eXBlOiBvcGVyYXRvclR5cGUsCiAgICAgICAgaXNfYWN0aXZlOiB0cnVlLAogICAgICB9LAogICAgICB7IG9uQ29uZmxpY3Q6ICJ0ZW5hbnRfaWQsdXNlcl9pZCIgfSwKICAgICk7CgogIGlmICh0ZW5hbnRVc2VyRXJyb3IpIHRocm93IHRlbmFudFVzZXJFcnJvcjsKCiAgY29uc3QgbWVtYmVyc2hpcFBheWxvYWQgPSB7CiAgICB0ZW5hbnRfaWQ6IHNjb3BlLnRlbmFudElkLAogICAgdXNlcl9pZDogY3JlYXRlZFVzZXJJZCwKICAgIHVuaXRfaWQ6IGFjdGl2ZVVuaXRJZCwKICAgIGlzX2FjdGl2ZTogdHJ1ZSwKICAgIHVwZGF0ZWRfYXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSwKICB9OwoKICBjb25zdCB7IGRhdGE6IGV4aXN0aW5nTWVtYmVyc2hpcCwgZXJyb3I6IGV4aXN0aW5nTWVtYmVyc2hpcEVycm9yIH0gPSBhd2FpdCBhZG1pbgogICAgLmZyb20oInVzZXJfdW5pdF9tZW1iZXJzaGlwcyIpCiAgICAuc2VsZWN0KCJpZCIpCiAgICAuZXEoInVzZXJfaWQiLCBjcmVhdGVkVXNlcklkKQogICAgLmVxKCJ1bml0X2lkIiwgYWN0aXZlVW5pdElkKQogICAgLm1heWJlU2luZ2xlKCk7CgogIGlmIChleGlzdGluZ01lbWJlcnNoaXBFcnJvcikgdGhyb3cgZXhpc3RpbmdNZW1iZXJzaGlwRXJyb3I7CgogIGlmIChleGlzdGluZ01lbWJlcnNoaXApIHsKICAgIGNvbnN0IHsgZXJyb3I6IHVwZGF0ZU1lbWJlcnNoaXBFcnJvciB9ID0gYXdhaXQgYWRtaW4KICAgICAgLmZyb20oInVzZXJfdW5pdF9tZW1iZXJzaGlwcyIpCiAgICAgIC51cGRhdGUobWVtYmVyc2hpcFBheWxvYWQpCiAgICAgIC5lcSgiaWQiLCAoZXhpc3RpbmdNZW1iZXJzaGlwIGFzIHsgaWQ6IHN0cmluZyB9KS5pZCk7CgogICAgaWYgKHVwZGF0ZU1lbWJlcnNoaXBFcnJvcikgdGhyb3cgdXBkYXRlTWVtYmVyc2hpcEVycm9yOwogICAgcmV0dXJuOwogIH0KCiAgY29uc3QgeyBlcnJvcjogaW5zZXJ0TWVtYmVyc2hpcEVycm9yIH0gPSBhd2FpdCBhZG1pbgogICAgLmZyb20oInVzZXJfdW5pdF9tZW1iZXJzaGlwcyIpCiAgICAuaW5zZXJ0KHsKICAgICAgLi4ubWVtYmVyc2hpcFBheWxvYWQsCiAgICAgIGNyZWF0ZWRfYXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSwKICAgIH0pOwoKICBpZiAoaW5zZXJ0TWVtYmVyc2hpcEVycm9yKSB0aHJvdyBpbnNlcnRNZW1iZXJzaGlwRXJyb3I7Cn0KCmZ1bmN0aW9uIG1hcE1lcmdlZFVzZXIoCiAgY3VycmVudFVzZXI6IFVzZXIsCiAgYXV0aFVzZXI6IFBhcnRpYWw8VXNlcj4gfCBudWxsLAogIHB1YmxpY1VzZXI6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgbnVsbCwKKSB7CiAgY29uc3QgYmFubmVkVW50aWxSYXcgPSAoYXV0aFVzZXIgYXMgeyBiYW5uZWRfdW50aWw/OiBzdHJpbmcgfCBudWxsIH0gfCBudWxsKT8uYmFubmVkX3VudGlsOwogIGNvbnN0IGJhbm5lZFVudGlsID0gKGJhbm5lZFVudGlsUmF3ICYmIGJhbm5lZFVudGlsUmF3ICE9PSAiIikgPyBuZXcgRGF0ZShiYW5uZWRVbnRpbFJhdykgOiBudWxsOwogIGNvbnN0IGF0aXZvID0gIShiYW5uZWRVbnRpbCAmJiBiYW5uZWRVbnRpbCA+IG5ldyBEYXRlKCkpOwoKICByZXR1cm4gewogICAgaWQ6IFN0cmluZyhwdWJsaWNVc2VyPy5pZCA/PyBhdXRoVXNlcj8uaWQgPz8gY3VycmVudFVzZXIuaWQpLAogICAgZW1haWw6CiAgICAgIChwdWJsaWNVc2VyPy5lbWFpbCA/IFN0cmluZyhwdWJsaWNVc2VyLmVtYWlsKSA6IG51bGwpID8/CiAgICAgIGF1dGhVc2VyPy5lbWFpbCA/PwogICAgICBjdXJyZW50VXNlci5lbWFpbCA/PwogICAgICBudWxsLAogICAgbm9tZToKICAgICAgKHB1YmxpY1VzZXI/Lm5vbWUgPyBTdHJpbmcocHVibGljVXNlci5ub21lKSA6IG51bGwpID8/CiAgICAgICgoYXV0aFVzZXI/LnVzZXJfbWV0YWRhdGEgYXMgeyBub21lPzogc3RyaW5nIH0gfCB1bmRlZmluZWQpPy5ub21lID8/IG51bGwpLAogICAgcm9sZToKICAgICAgKChhdXRoVXNlcj8uYXBwX21ldGFkYXRhIGFzIHsgcm9sZT86IHN0cmluZyB9IHwgdW5kZWZpbmVkKT8ucm9sZSA/PyBudWxsKSA/PwogICAgICAidXNlciIsCiAgICBhdGl2bywKICAgIGNyZWF0ZWRBdDoKICAgICAgKHB1YmxpY1VzZXI/LmNyZWF0ZWRfYXQgPyBTdHJpbmcocHVibGljVXNlci5jcmVhdGVkX2F0KSA6IG51bGwpID8/CiAgICAgIGF1dGhVc2VyPy5jcmVhdGVkX2F0ID8/CiAgICAgIGN1cnJlbnRVc2VyLmNyZWF0ZWRfYXQsCiAgICBlbWFpbENvbmZpcm1lZEF0OiBhdXRoVXNlcj8uZW1haWxfY29uZmlybWVkX2F0ID8/IGN1cnJlbnRVc2VyLmVtYWlsX2NvbmZpcm1lZF9hdCwKICB9Owp9CgovLyAtLS0tLS0tLS0tIEhhbmRsZXJzIGRlIGFjdGlvbiAtLS0tLS0tLS0tCgphc3luYyBmdW5jdGlvbiBoYW5kbGVJbnZpdGUoYWRtaW46IFN1cGFiYXNlQ2xpZW50LCBwYXlsb2FkOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KSB7CiAgY29uc3QgeyBlbWFpbCwgbm9tZSwgcm9sZSA9ICJ1c2VyIiwgdGVuYW50Q29kZSB9ID0gcGF5bG9hZDsKCiAgY29uc3QgYXBwT3JpZ2luID0gRGVuby5lbnYuZ2V0KCJBUFBfT1JJR0lOIikgfHwgImh0dHBzOi8vYXBwLnNpZ2Vzcy5jb20uYnIiOwogIGNvbnN0IHJlZGlyZWN0VG8gPSB0ZW5hbnRDb2RlCiAgICA/IGAke2FwcE9yaWdpbn0vcGFzc3dvcmQ/dGVuYW50PSR7dGVuYW50Q29kZX1gCiAgICA6IGAke2FwcE9yaWdpbn0vcGFzc3dvcmRgOwoKICBjb25zb2xlLmxvZyhgW01hbmFnZVVzZXJdIENvbnZpZGFuZG8gdXN1w6FyaW86ICR7ZW1haWx9ICgke3JvbGV9KWApOwoKICBjb25zdCB7IGRhdGEsIGVycm9yIH0gPSBhd2FpdCBhZG1pbi5hdXRoLmFkbWluLmludml0ZVVzZXJCeUVtYWlsKGVtYWlsLCB7CiAgICByZWRpcmVjdFRvLAogICAgZGF0YTogeyBub21lLCByb2xlIH0sCiAgfSk7CgogIGlmIChlcnJvcikgewogICAgY29uc29sZS5lcnJvcigiW01hbmFnZVVzZXJdIEVycm8gbm8gaW52aXRlVXNlckJ5RW1haWw6IiwgZXJyb3IubWVzc2FnZSwgZXJyb3IpOwogICAgdGhyb3cgZXJyb3I7CiAgfQoKICBpZiAoZGF0YS51c2VyKSB7CiAgICBhd2FpdCBhZG1pbi5hdXRoLmFkbWluLnVwZGF0ZVVzZXJCeUlkKGRhdGEudXNlci5pZCwgeyBhcHBfbWV0YWRhdGE6IHsgcm9sZSB9IH0pOwogIH0KCiAgcmV0dXJuIGRhdGE7Cn0KCmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUludml0ZVdpdGhTY29wZSgKICBhZG1pbjogU3VwYWJhc2VDbGllbnQsCiAgc2NvcGU6IEFjY2Vzc1Njb3BlLAogIGN1cnJlbnRVc2VyOiBVc2VyLAogIHBheWxvYWQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sCikgewogIGNvbnN0IGRhdGEgPSBhd2FpdCBoYW5kbGVJbnZpdGUoYWRtaW4sIHBheWxvYWQpOwogIGNvbnN0IGNyZWF0ZWRVc2VySWQgPQogICAgKGRhdGEgYXMgeyB1c2VyPzogeyBpZD86IHN0cmluZyB9IH0gfCBudWxsKT8udXNlcj8uaWQgPz8KICAgIChkYXRhIGFzIHsgaWQ/OiBzdHJpbmcgfSB8IG51bGwpPy5pZCA/PwogICAgbnVsbDsKCiAgaWYgKGNyZWF0ZWRVc2VySWQpIHsKICAgIGF3YWl0IGF0dGFjaFVzZXJUb1NoYXJlZFNjb3BlKAogICAgICBhZG1pbiwKICAgICAgc2NvcGUsCiAgICAgIGN1cnJlbnRVc2VyLAogICAgICBjcmVhdGVkVXNlcklkLAogICAgICBTdHJpbmcocGF5bG9hZC5yb2xlID8/ICJ1c2VyIiksCiAgICAgIHR5cGVvZiBwYXlsb2FkLmFjdGl2ZVVuaXRJZCA9PT0gInN0cmluZyIgPyBwYXlsb2FkLmFjdGl2ZVVuaXRJZCA6IG51bGwsCiAgICApOwogIH0KCiAgcmV0dXJuIGRhdGE7Cn0KCmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUNyZWF0ZShhZG1pbjogU3VwYWJhc2VDbGllbnQsIHBheWxvYWQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IGJvb2xlYW4+KSB7CiAgY29uc3QgeyBlbWFpbCwgcGFzc3dvcmQsIG5vbWUsIHJvbGUgPSAidXNlciIsIGVtYWlsX2NvbmZpcm0gPSB0cnVlIH0gPSBwYXlsb2FkOwoKICBjb25zb2xlLmxvZyhgW01hbmFnZVVzZXJdIENyaWFuZG8gdXN1w6FyaW8gbWFudWFsOiAke2VtYWlsfSAoJHtyb2xlfSlgKTsKCiAgY29uc3QgeyBkYXRhLCBlcnJvciB9ID0gYXdhaXQgYWRtaW4uYXV0aC5hZG1pbi5jcmVhdGVVc2VyKHsKICAgIGVtYWlsOiBlbWFpbCBhcyBzdHJpbmcsCiAgICBwYXNzd29yZDogcGFzc3dvcmQgYXMgc3RyaW5nLAogICAgdXNlcl9tZXRhZGF0YTogeyBub21lLCByb2xlIH0sCiAgICBhcHBfbWV0YWRhdGE6IHsgcm9sZSB9LAogICAgZW1haWxfY29uZmlybTogZW1haWxfY29uZmlybSBhcyBib29sZWFuLAogIH0pOwogIGlmIChlcnJvcikgdGhyb3cgZXJyb3I7CgogIHJldHVybiBkYXRhOwp9Cgphc3luYyBmdW5jdGlvbiBoYW5kbGVDcmVhdGVXaXRoU2NvcGUoCiAgYWRtaW46IFN1cGFiYXNlQ2xpZW50LAogIHNjb3BlOiBBY2Nlc3NTY29wZSwKICBjdXJyZW50VXNlcjogVXNlciwKICBwYXlsb2FkOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBib29sZWFuPiwKKSB7CiAgY29uc3QgZGF0YSA9IGF3YWl0IGhhbmRsZUNyZWF0ZShhZG1pbiwgcGF5bG9hZCk7CiAgY29uc3QgY3JlYXRlZFVzZXJJZCA9CiAgICAoZGF0YSBhcyB7IHVzZXI/OiB7IGlkPzogc3RyaW5nIH0gfSB8IG51bGwpPy51c2VyPy5pZCA/PwogICAgKGRhdGEgYXMgeyBpZD86IHN0cmluZyB9IHwgbnVsbCk/LmlkID8/CiAgICBudWxsOwoKICBpZiAoY3JlYXRlZFVzZXJJZCkgewogICAgYXdhaXQgYXR0YWNoVXNlclRvU2hhcmVkU2NvcGUoCiAgICAgIGFkbWluLAogICAgICBzY29wZSwKICAgICAgY3VycmVudFVzZXIsCiAgICAgIGNyZWF0ZWRVc2VySWQsCiAgICAgIFN0cmluZyhwYXlsb2FkLnJvbGUgPz8gInVzZXIiKSwKICAgICAgdHlwZW9mIHBheWxvYWQuYWN0aXZlVW5pdElkID09PSAic3RyaW5nIiA/IHBheWxvYWQuYWN0aXZlVW5pdElkIDogbnVsbCwKICAgICk7CiAgfQoKICByZXR1cm4gZGF0YTsKfQoKYXN5bmMgZnVuY3Rpb24gaGFuZGxlRGVhY3RpdmF0ZShhZG1pbjogU3VwYWJhc2VDbGllbnQsIHBheWxvYWQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pIHsKICBjb25zdCB7IHVzZXJJZCB9ID0gcGF5bG9hZDsKICBjb25zb2xlLmxvZyhgW01hbmFnZVVzZXJdIERlc2F0aXZhbmRvIHVzdcOhcmlvOiAke3VzZXJJZH1gKTsKCiAgY29uc3QgeyBlcnJvcjogYXV0aEVycm9yIH0gPSBhd2FpdCBhZG1pbi5hdXRoLmFkbWluLnVwZGF0ZVVzZXJCeUlkKHVzZXJJZCwgeyBiYW5fZHVyYXRpb246ICI4NzY2MDBoIiB9KTsKICBpZiAoYXV0aEVycm9yKSB0aHJvdyBhdXRoRXJyb3I7CgogIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6ICJVc3XDoXJpbyBkZXNhdGl2YWRvIGUgYmFuaWRvIG5vIEF1dGgiIH07Cn0KCmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUFjdGl2YXRlKGFkbWluOiBTdXBhYmFzZUNsaWVudCwgcGF5bG9hZDogUmVjb3JkPHN0cmluZywgc3RyaW5nPikgewogIGNvbnN0IHsgdXNlcklkIH0gPSBwYXlsb2FkOwogIGNvbnNvbGUubG9nKGBbTWFuYWdlVXNlcl0gUmVhdGl2YW5kbyB1c3XDoXJpbzogJHt1c2VySWR9YCk7CgogIGNvbnN0IHsgZXJyb3I6IGF1dGhFcnJvciB9ID0gYXdhaXQgYWRtaW4uYXV0aC5hZG1pbi51cGRhdGVVc2VyQnlJZCh1c2VySWQsIHsgYmFuX2R1cmF0aW9uOiAibm9uZSIgfSk7CiAgaWYgKGF1dGhFcnJvcikgdGhyb3cgYXV0aEVycm9yOwoKICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAiVXN1w6FyaW8gYXRpdmFkbyIgfTsKfQoKYXN5bmMgZnVuY3Rpb24gaGFuZGxlRGVsZXRlKGFkbWluOiBTdXBhYmFzZUNsaWVudCwgcGF5bG9hZDogUmVjb3JkPHN0cmluZywgc3RyaW5nPikgewogIGNvbnN0IHsgdXNlcklkIH0gPSBwYXlsb2FkOwogIGlmICghdXNlcklkKSB0aHJvdyBuZXcgRXJyb3IoInVzZXJJZCDDqSBvYnJpZ2F0w7NyaW8gcGFyYSBleGNsdXPDo28iKTsKCiAgY29uc29sZS5sb2coYFtNYW5hZ2VVc2VyXSBFeGNsdWluZG8gdXN1w6FyaW86ICR7dXNlcklkfWApOwoKICBjb25zdCB7IGVycm9yOiBhdXRoRXJyb3IgfSA9IGF3YWl0IGFkbWluLmF1dGguYWRtaW4uZGVsZXRlVXNlcih1c2VySWQpOwogIGlmIChhdXRoRXJyb3IpIHRocm93IGF1dGhFcnJvcjsKCiAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgbWVzc2FnZTogIlVzdcOhcmlvIGV4Y2x1w61kbyBwZXJtYW5lbnRlbWVudGUiIH07Cn0KCmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVJlc2VuZENvbmZpcm1hdGlvbihhZG1pbjogU3VwYWJhc2VDbGllbnQsIHBheWxvYWQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pIHsKICBjb25zdCB7IGVtYWlsLCB0ZW5hbnRDb2RlIH0gPSBwYXlsb2FkOwogIGlmICghZW1haWwpIHRocm93IG5ldyBFcnJvcigiZW1haWwgw6kgb2JyaWdhdMOzcmlvIHBhcmEgcmVlbnZpbyBkZSBjb25maXJtYcOnw6NvIik7CgogIGNvbnNvbGUubG9nKGBbTWFuYWdlVXNlcl0gUmVlbnZpYW5kbyBjb25maXJtYcOnw6NvIHBhcmE6ICR7ZW1haWx9YCk7CgogIGNvbnN0IGFwcE9yaWdpbiA9IERlbm8uZW52LmdldCgiQVBQX09SSUdJTiIpIHx8ICJodHRwczovL2FwcC5zaWdlc3MuY29tLmJyIjsKICBjb25zdCByZWRpcmVjdFRvID0gdGVuYW50Q29kZQogICAgPyBgJHthcHBPcmlnaW59L3Bhc3N3b3JkP3RlbmFudD0ke3RlbmFudENvZGV9YAogICAgOiBgJHthcHBPcmlnaW59L3Bhc3N3b3JkYDsKCiAgY29uc3QgeyBlcnJvciB9ID0gYXdhaXQgYWRtaW4uYXV0aC5hZG1pbi5pbnZpdGVVc2VyQnlFbWFpbChlbWFpbCwgewogICAgcmVkaXJlY3RUbywKICB9KTsKICBpZiAoZXJyb3IpIHRocm93IGVycm9yOwoKICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAiRS1tYWlsIGRlIGNvbmZpcm1hw6fDo28gcmVlbnZpYWRvIGNvbSBzdWNlc3NvIiB9Owp9Cgphc3luYyBmdW5jdGlvbiBoYW5kbGVMaXN0KAogIGFkbWluOiBTdXBhYmFzZUNsaWVudCwKICBjdXJyZW50VXNlcjogVXNlciwKICBwYXlsb2FkPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sCikgewogIGNvbnN0IHNjb3BlID0gYXdhaXQgcmVzb2x2ZUFjY2Vzc1Njb3BlKGFkbWluLCBjdXJyZW50VXNlcik7CiAgY29uc29sZS5sb2coCiAgICBgW01hbmFnZVVzZXJdIExpc3RhbmRvIHVzdcOhcmlvcyAobW9kZT0ke3Njb3BlLm1vZGV9LCB0ZW5hbnRSb2xlPSR7c2NvcGUudGVuYW50Um9sZSA/PyAibi9hIn0sIGlzQWRtaW49JHtzY29wZS5pc0FkbWlufSkuLi5gLAogICk7CgogIGNvbnN0IGFsbG93ZWRJZHMgPQogICAgc2NvcGUubW9kZSA9PT0gInNoYXJlZCIKICAgICAgPyBhd2FpdCBsaXN0U2hhcmVkQWxsb3dlZElkcygKICAgICAgICAgIGFkbWluLAogICAgICAgICAgc2NvcGUsCiAgICAgICAgICBjdXJyZW50VXNlciwKICAgICAgICAgIHR5cGVvZiBwYXlsb2FkPy5hY3RpdmVVbml0SWQgPT09ICJzdHJpbmciID8gcGF5bG9hZC5hY3RpdmVVbml0SWQgOiBudWxsLAogICAgICAgICkKICAgICAgOiBzY29wZS5pc0FkbWluCiAgICAgICAgPyBudWxsCiAgICAgICAgOiBbY3VycmVudFVzZXIuaWRdOwoKICBsZXQgZGJRdWVyeSA9IGFkbWluLmZyb20oInVzZXJfcHJvZmlsZXMiKS5zZWxlY3QoImlkLCBlbWFpbCwgbm9tZSwgaXNfYWN0aXZlLCBjcmVhdGVkX2F0Iik7CiAgaWYgKGFsbG93ZWRJZHMgJiYgYWxsb3dlZElkcy5sZW5ndGggPiAwKSB7CiAgICBkYlF1ZXJ5ID0gZGJRdWVyeS5pbigiaWQiLCBhbGxvd2VkSWRzKTsKICB9CgogIGNvbnN0IHsgZGF0YTogcHVibGljVXNlcnMsIGVycm9yOiBkYkVyciB9ID0gYXdhaXQgZGJRdWVyeTsKICBpZiAoZGJFcnIpIHRocm93IGRiRXJyOwoKICBpZiAoIXNjb3BlLmlzQWRtaW4pIHsKICAgIGNvbnN0IHNlbGZQdWJsaWNVc2VyID0KICAgICAgKHB1YmxpY1VzZXJzPy5maW5kKCh1c2VyKSA9PiBTdHJpbmcoKHVzZXIgYXMgeyBpZD86IHN0cmluZyB9KS5pZCA/PyAiIikgPT09IGN1cnJlbnRVc2VyLmlkKSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCkgPz8KICAgICAgbnVsbDsKCiAgICByZXR1cm4gW21hcE1lcmdlZFVzZXIoY3VycmVudFVzZXIsIGN1cnJlbnRVc2VyLCBzZWxmUHVibGljVXNlcildOwogIH0KCiAgY29uc3QgeyBkYXRhOiB7IHVzZXJzIH0sIGVycm9yOiBhdXRoRXJyb3IgfSA9IGF3YWl0IGFkbWluLmF1dGguYWRtaW4ubGlzdFVzZXJzKHsgcGVyUGFnZTogMTAwMCB9KTsKICBpZiAoYXV0aEVycm9yKSB0aHJvdyBhdXRoRXJyb3I7CgogIGNvbnN0IHZpc2libGVJZHMgPQogICAgYWxsb3dlZElkcyAmJiBhbGxvd2VkSWRzLmxlbmd0aCA+IDAKICAgICAgPyBuZXcgU2V0KGFsbG93ZWRJZHMpCiAgICAgIDogbmV3IFNldCgocHVibGljVXNlcnMgPz8gW10pLm1hcCgodXNlcikgPT4gU3RyaW5nKCh1c2VyIGFzIHsgaWQ/OiBzdHJpbmcgfSkuaWQgPz8gIiIpKSk7CgogIHJldHVybiB1c2VycwogICAgLmZpbHRlcigoYXV0aFVzZXIpID0+IHZpc2libGVJZHMuaGFzKGF1dGhVc2VyLmlkKSkKICAgIC5tYXAoKGF1dGhVc2VyKSA9PiB7CiAgICAgIGNvbnN0IHB1YmxpY1VzZXIgPQogICAgICAgIChwdWJsaWNVc2Vycz8uZmluZCgodXNlcikgPT4gU3RyaW5nKCh1c2VyIGFzIHsgaWQ/OiBzdHJpbmcgfSkuaWQgPz8gIiIpID09PSBhdXRoVXNlci5pZCkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpID8/CiAgICAgICAgbnVsbDsKICAgICAgcmV0dXJuIG1hcE1lcmdlZFVzZXIoY3VycmVudFVzZXIsIGF1dGhVc2VyLCBwdWJsaWNVc2VyKTsKICAgIH0pOwp9CgovLyAtLS0tLS0tLS0tIERpc3BhdGNoZXIgLS0tLS0tLS0tLQoKY29uc3QgQUNUSU9OX0hBTkRMRVJTOiBSZWNvcmQ8CiAgc3RyaW5nLAogIChhZG1pbjogU3VwYWJhc2VDbGllbnQsIHBheWxvYWQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IGJvb2xlYW4+KSA9PiBQcm9taXNlPHVua25vd24+Cj4gPSB7CiAgaW52aXRlOiBoYW5kbGVJbnZpdGUsCiAgY3JlYXRlOiBoYW5kbGVDcmVhdGUsCiAgZGVhY3RpdmF0ZTogaGFuZGxlRGVhY3RpdmF0ZSwKICBhY3RpdmF0ZTogaGFuZGxlQWN0aXZhdGUsCiAgZGVsZXRlOiBoYW5kbGVEZWxldGUsCiAgcmVzZW5kX2NvbmZpcm1hdGlvbjogaGFuZGxlUmVzZW5kQ29uZmlybWF0aW9uLAogIGxpc3Q6IGhhbmRsZUxpc3QgYXMgdW5rbm93biBhcyAoYWRtaW46IFN1cGFiYXNlQ2xpZW50LCBwYXlsb2FkOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBib29sZWFuPikgPT4gUHJvbWlzZTx1bmtub3duPiwKICB0b2dnbGVVc2VyU3RhdHVzOiAoYWRtaW4sIHBheWxvYWQpID0+IHsKICAgIGNvbnN0IGlzQWN0aXZlID0gcGF5bG9hZC5hdGl2byAhPT0gdW5kZWZpbmVkID8gcGF5bG9hZC5hdGl2byA6IHBheWxvYWQuaXNBY3RpdmU7CiAgICByZXR1cm4gaXNBY3RpdmUgPyBoYW5kbGVEZWFjdGl2YXRlKGFkbWluLCBwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz4pIDogaGFuZGxlQWN0aXZhdGUoYWRtaW4sIHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPik7CiAgfSwKfTsKCi8vIC0tLS0tLS0tLS0gRW50cnkgcG9pbnQgLS0tLS0tLS0tLQoKc2VydmUoYXN5bmMgKHJlcTogUmVxdWVzdCkgPT4gewogIGlmIChyZXEubWV0aG9kID09PSAiT1BUSU9OUyIpIHsKICAgIHJldHVybiBuZXcgUmVzcG9uc2UoIm9rIiwgeyBoZWFkZXJzOiBjb3JzSGVhZGVycyB9KTsKICB9CgogIHRyeSB7CiAgICBjb25zdCBhdXRoSGVhZGVyID0gcmVxLmhlYWRlcnMuZ2V0KCJBdXRob3JpemF0aW9uIik7CiAgICBpZiAoIWF1dGhIZWFkZXIpIHRocm93IG5ldyBFcnJvcigiU2VtIGNhYmXDp2FsaG8gZGUgYXV0b3JpemHDp8OjbyIpOwoKICAgIGNvbnN0IHN1cGFiYXNlVXJsID0gRGVuby5lbnYuZ2V0KCJTVVBBQkFTRV9VUkwiKSB8fCAiIjsKICAgIGNvbnN0IHN1cGFiYXNlU2VydmljZUtleSA9IERlbm8uZW52LmdldCgiU1VQQUJBU0VfU0VSVklDRV9ST0xFX0tFWSIpIHx8ICIiOwoKICAgIGNvbnN0IHN1cGFiYXNlQWRtaW4gPSBjcmVhdGVDbGllbnQoc3VwYWJhc2VVcmwsIHN1cGFiYXNlU2VydmljZUtleSwgewogICAgICBhdXRoOiB7IGF1dG9SZWZyZXNoVG9rZW46IGZhbHNlLCBwZXJzaXN0U2Vzc2lvbjogZmFsc2UgfSwKICAgIH0pOwoKICAgIGNvbnN0IHRva2VuID0gYXV0aEhlYWRlci5yZXBsYWNlKCJCZWFyZXIgIiwgIiIpOwogICAgY29uc3QgeyBkYXRhOiB7IHVzZXIgfSwgZXJyb3I6IGF1dGhFcnIgfSA9IGF3YWl0IHN1cGFiYXNlQWRtaW4uYXV0aC5nZXRVc2VyKHRva2VuKTsKCiAgICBpZiAoYXV0aEVyciB8fCAhdXNlcikgewogICAgICBjb25zb2xlLmVycm9yKCJbTWFuYWdlVXNlcl0gRXJybyBkZSBhdXRlbnRpY2HDp8OjbyBkbyBjaGFtYWRvcjoiLCBhdXRoRXJyKTsKICAgICAgdGhyb3cgbmV3IEVycm9yKCJBY2Vzc28gbsOjbyBhdXRvcml6YWRvIG91IHRva2VuIGV4cGlyYWRvLiIpOwogICAgfQoKICAgIGNvbnN0IHsgYWN0aW9uLCBwYXlsb2FkID0ge30gfSA9IGF3YWl0IHJlcS5qc29uKCk7CiAgICBjb25zdCBhY2Nlc3NTY29wZSA9IGF3YWl0IHJlc29sdmVBY2Nlc3NTY29wZShzdXBhYmFzZUFkbWluLCB1c2VyKTsKCiAgICBpZiAoYWN0aW9uICE9PSAibGlzdCIgJiYgIWFjY2Vzc1Njb3BlLmlzQWRtaW4pIHsKICAgICAgY29uc29sZS53YXJuKGBbTWFuYWdlVXNlcl0gVGVudGF0aXZhIGRlIGHDp8OjbyBwcm9pYmlkYSAoJHthY3Rpb259KSBwb3IgdXN1w6FyaW8gc2VtIGVzY29wbyBhZG1pbmlzdHJhdGl2bzogJHt1c2VyLmVtYWlsfWApOwogICAgICByZXR1cm4ganNvblJlc3BvbnNlKHsgZXJyb3I6ICJPcGVyYcOnw6NvIHJlc3RyaXRhIGFvIGdlc3RvciBkYSBlbnRpZGFkZS4iIH0sIDQwMyk7CiAgICB9CgogICAgaWYgKAogICAgICBhY2Nlc3NTY29wZS5tb2RlID09PSAic2hhcmVkIiAmJgogICAgICBhY2Nlc3NTY29wZS50ZW5hbnRSb2xlICE9PSAib3duZXIiICYmCiAgICAgIFsiZGVhY3RpdmF0ZSIsICJhY3RpdmF0ZSIsICJkZWxldGUiLCAidG9nZ2xlVXNlclN0YXR1cyJdLmluY2x1ZGVzKFN0cmluZyhhY3Rpb24pKQogICAgKSB7CiAgICAgIGNvbnN0IHRhcmdldFVzZXJJZCA9CiAgICAgICAgdHlwZW9mIHBheWxvYWQ/LnVzZXJJZCA9PT0gInN0cmluZyIgPyBwYXlsb2FkLnVzZXJJZCA6IG51bGw7CgogICAgICBpZiAoIXRhcmdldFVzZXJJZCkgewogICAgICAgIHJldHVybiBqc29uUmVzcG9uc2UoeyBlcnJvcjogIlVzdcOhcmlvIGFsdm8gbsOjbyBpbmZvcm1hZG8uIiB9LCA0MDApOwogICAgICB9CgogICAgICBjb25zdCBhbGxvd2VkSWRzID0gYXdhaXQgbGlzdFNoYXJlZEFsbG93ZWRJZHMoc3VwYWJhc2VBZG1pbiwgYWNjZXNzU2NvcGUsIHVzZXIpOwogICAgICBpZiAoIWFsbG93ZWRJZHMuaW5jbHVkZXModGFyZ2V0VXNlcklkKSkgewogICAgICAgIGNvbnNvbGUud2FybihgW01hbmFnZVVzZXJdIEHDp8OjbyAke2FjdGlvbn0gZm9yYSBkbyBlc2NvcG8gZG8gcG9sbyBwb3IgJHt1c2VyLmVtYWlsfSBlbSAke3RhcmdldFVzZXJJZH1gKTsKICAgICAgICByZXR1cm4ganNvblJlc3BvbnNlKHsgZXJyb3I6ICJPcGVyYcOnw6NvIGZvcmEgZG8gZXNjb3BvIGRvIHBvbG8uIiB9LCA0MDMpOwogICAgICB9CiAgICB9CgogICAgY29uc3QgaGFuZGxlciA9IEFDVElPTl9IQU5ETEVSU1thY3Rpb25dOwogICAgaWYgKCFoYW5kbGVyKSB0aHJvdyBuZXcgRXJyb3IoYEHDp8OjbyAnJHthY3Rpb259JyBkZXNjb25oZWNpZGEuYCk7CgogICAgY29uc3QgcmVzdWx0ID0KICAgICAgYWN0aW9uID09PSAibGlzdCIKICAgICAgICA/IGF3YWl0IGhhbmRsZUxpc3Qoc3VwYWJhc2VBZG1pbiwgdXNlciwgcGF5bG9hZCkKICAgICAgICA6IGFjdGlvbiA9PT0gImludml0ZSIKICAgICAgICAgID8gYXdhaXQgaGFuZGxlSW52aXRlV2l0aFNjb3BlKHN1cGFiYXNlQWRtaW4sIGFjY2Vzc1Njb3BlLCB1c2VyLCBwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz4pCiAgICAgICAgICA6IGFjdGlvbiA9PT0gImNyZWF0ZSIKICAgICAgICAgICAgPyBhd2FpdCBoYW5kbGVDcmVhdGVXaXRoU2NvcGUoCiAgICAgICAgICAgICAgICBzdXBhYmFzZUFkbWluLAogICAgICAgICAgICAgICAgYWNjZXNzU2NvcGUsCiAgICAgICAgICAgICAgICB1c2VyLAogICAgICAgICAgICAgICAgcGF5bG9hZCBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBib29sZWFuPiwKICAgICAgICAgICAgICApCiAgICAgICAgICAgIDogYXdhaXQgaGFuZGxlcihzdXBhYmFzZUFkbWluLCBwYXlsb2FkKTsKCiAgICByZXR1cm4ganNvblJlc3BvbnNlKHJlc3VsdCk7CiAgfSBjYXRjaCAoZXJyb3I6IHVua25vd24pIHsKICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICJFcnJvIGRlc2NvbmhlY2lkbyI7CiAgICBjb25zdCBzdGF0dXMgPSBtZXNzYWdlLmluY2x1ZGVzKCJhdXRob3JpemVkIikgPyA0MDEgOiA0MDA7CgogICAgY29uc29sZS5lcnJvcigiW01hbmFnZVVzZXJdIEVycm8gZmF0YWw6IiwgbWVzc2FnZSwgZXJyb3IpOwogICAgcmV0dXJuIGpzb25SZXNwb25zZSh7IGVycm9yOiBtZXNzYWdlIH0sIHN0YXR1cyk7CiAgfQp9KTsK`;

interface OnboardingPayload {
  tenantLabel: string;
  projectRef: string;
  supabaseAccountId: string;
  adminEmail?: string;
  maxSocios?: number | null;
  acessoExpiraEm?: string | null;
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
    if (!payload.tenantLabel || !payload.projectRef || !payload.supabaseAccountId) {
      throw new Error("Missing required payload fields");
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from("onboarding_jobs")
      .insert({
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
  if (updates.entidade_id) { updates.projeto_id = updates.entidade_id; delete updates.entidade_id; }
  await supabaseAdmin.from('onboarding_jobs').update(updates).eq('id', jobId);
}

// --- Main background processing ---
async function processOnboarding(jobId: string, payload: OnboardingPayload, supabaseAdmin: SupabaseClient) {
  try {
    const { projectRef, tenantLabel, adminEmail, supabaseAccountId, maxSocios, acessoExpiraEm } = payload;
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
    const projetoId = await registerProjectInCentral(supabaseAdmin, tenantLabel, projectUrl, anonKey, serviceRoleKey, managementToken);

    // 6. Finalization
    await updateJob(supabaseAdmin, jobId, "finalizing_setup", 1, undefined, projetoId);
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

async function fetchReferenceStorageBlueprint(supabaseAdmin: SupabaseClient) {
  const { data: reference, error } = await supabaseAdmin
    .from("projetos")
    .select("supabase_url, supabase_access_token")
    .eq("tenant_code", "sinpesca")
    .single();

  if (error || !reference?.supabase_access_token || !reference.supabase_url) {
    throw new Error("Falha ao carregar blueprint de storage do projeto de referência (sinpesca/Rayssa).");
  }

  const projectRef = new URL(reference.supabase_url).hostname.split(".")[0];
  const rows = await runManagementQuery(projectRef, reference.supabase_access_token, STORAGE_SNAPSHOT_QUERY);
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
  const blueprint = await fetchReferenceStorageBlueprint(supabaseAdmin);
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
  const { data, error: authError } = await client.auth.admin.createUser({
    email,
    password: pass,
    email_confirm: true,
    app_metadata: { role: "admin" },
  });
  if (authError && !authError.message.includes("already exists")) throw authError;

  const userId = data?.user?.id;
  if (!userId) return;

  await client.auth.admin.updateUserById(userId, { app_metadata: { role: "admin" } });

  // Vincular owner ao tenant e unidade criados pelo seed
  const { data: tenant } = await client.from("tenants").select("id").limit(1).maybeSingle();
  const { data: unit } = await client.from("tenant_units").select("id").limit(1).maybeSingle();

  if (tenant?.id && unit?.id) {
    const { error: tuError } = await client.from("tenant_users").insert({
      tenant_id: tenant.id,
      user_id: userId,
      tenant_role: "owner",
      is_active: true,
    });
    if (tuError && !tuError.message.includes("duplicate")) throw tuError;

    const { error: umError } = await client.from("user_unit_memberships").insert({
      tenant_id: tenant.id,
      user_id: userId,
      unit_id: unit.id,
      is_active: true,
    });
    if (umError && !umError.message.includes("duplicate")) throw umError;
  }
}

async function registerProjectInCentral(admin: SupabaseClient, label: string, url: string, anon: string, sr: string, pat: string) {
  const { data: existing } = await admin.from('projetos').select('id').eq('supabase_url', url).single();
  if (existing) return existing.id;

  const { data: projeto, error } = await admin.from('projetos').insert({
    project_name: label,
    supabase_url: url,
    supabase_publishable_key: anon,
    supabase_secret_keys: sr,
    supabase_access_token: pat,
    topology: 'unconfigured',
  }).select('id').single();
  if (error || !projeto) throw new Error("Failed to register project: " + (error ? error.message : ""));

  return projeto.id;
}
