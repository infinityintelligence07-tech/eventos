#!/bin/sh
# Impressão digital do código que vai para a produção: muda quando qualquer arquivo de src/ ou o package.json muda.
# O Dockerfile grava o resultado em /app/.versao, a rota /api/versao mostra, e o fluxo Deploy compara com o que
# calculou no commit publicado. Não depende do Git (o build do Easypanel não tem a pasta .git).
set -eu
find src package.json -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -c1-16
