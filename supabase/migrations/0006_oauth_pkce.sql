-- Mercado Libre ahora exige PKCE en el flujo OAuth (code_challenge en
-- /authorization, code_verifier en /oauth/token). Se guarda el verifier
-- junto al state, de un solo uso, igual que el resto del flujo.
alter table oauth_states add column if not exists code_verifier text;
