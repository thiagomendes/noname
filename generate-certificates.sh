#!/bin/bash
# Script para gerar certificados SSL autoassinados para desenvolvimento local

# Criar diretório para certificados se não existir
mkdir -p certificates

# Gerar chave privada e certificado
echo "Gerando certificados SSL autoassinados para desenvolvimento..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout certificates/key.pem -out certificates/cert.pem -subj "/C=BR/ST=Estado/L=Cidade/O=Organizacao/CN=localhost"

# Verificar se os certificados foram criados
if [ -f "certificates/key.pem" ] && [ -f "certificates/cert.pem" ]; then
    echo "✅ Certificados gerados com sucesso!"
    echo "📁 Localizados em:"
    echo "   - $(pwd)/certificates/key.pem"
    echo "   - $(pwd)/certificates/cert.pem"
    echo ""
    echo "⚠️  ATENÇÃO: Estes certificados são autoassinados e destinados APENAS para desenvolvimento."
    echo "   Para produção, use certificados válidos de uma autoridade certificadora confiável."
else
    echo "❌ Erro ao gerar certificados!"
fi

# Instruções para uso
echo ""
echo "📋 Para usar estes certificados com o servidor:"
echo "  1. Execute a aplicação com 'npm start'"
echo "  2. Acesse 'https://localhost' no navegador"
echo "  3. Aceite o aviso de segurança no navegador (apenas para desenvolvimento)"