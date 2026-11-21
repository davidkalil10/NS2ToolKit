# Fontes dos componentes distribuídos

O portátil contém os arquivos oficiais de kaiHEN 20261117.1, sem recompilação ou modificação dos binários. As licenças originais acompanham `payload/licenses`. Os arquivos ZIP em `sources/` contêm fontes e receitas de compilação dos projetos distribuídos, nas revisões listadas em `source-manifest.json`, com SHA-256.

Componentes: kaiHEN, ounce-hbloader, ounce-hbmenu, OunceShell (incluindo ftpd), libounce, OunceVK, libkaihen do SDK e ounce-devkit 20261117. O manifesto também inclui libconfig 1.7.2 e as receitas/patches Switch de devkitPro. São arquivos de desenvolvimento; não precisam ser extraídos para executar o assistente. Consulte os avisos e as licenças dentro de cada projeto antes de redistribuir modificações.

## Compilar ou modificar

1. Extraia cada arquivo fonte para uma pasta separada. `kaihen` contém `Dockerfile`, `Makefile` e `release/Makefile`, que fixam as revisões de hbloader, hbmenu e OunceShell.
2. O README e `build/make-devkit.sh` de ounce-devkit explicam como construir o SDK usando libounce, OunceVK e libkaihen. As revisões estão em `build/sources`. O ambiente de base é `devkitpro/devkita64:20260219`; as ferramentas e portlibs padrão vêm do devkitPro.
3. Para reconstruir ou modificar bibliotecas padrão, use as receitas do arquivo `devkitpro-portlibs`, incluindo `switch/libconfig/PKGBUILD` e `libconfig.patch`. Use as fontes da versão indicada em cada receita; as demais bibliotecas têm licenças e URLs preservados nesses projetos.
4. Com a imagem `ounce-devkit` pronta, o Dockerfile de kaiHEN documenta `docker build --build-arg RELEASE=1 --output out .`. O resultado inclui o hbmenu e OunceShell, compilados a partir das fontes. As instruções permitem modificar e recompilar as aplicações para ligá-las a bibliotecas alteradas; não há bloqueio de assinatura adicional imposto pelo NS2ToolKit.

O host JavaScript modificado fica em `host/`, com README e licença de origem. Os patches locais estão descritos no README desta integração. Não há alterações locais nos binários oficiais nem alegação de reprodução binária idêntica em uma máquina diferente.

No repositório do NS2ToolKit, `Preparar-Fontes-Kaihen.ps1` baixa/confere os arquivos de fonte antes do empacotamento; `-Offline` exige os arquivos já presentes no cache. `Empacotar-Portatil.ps1` exige todos os arquivos e os inclui no ZIP da release, junto do manifesto e deste guia.

A lista de fontes e revisoes e definida apenas em `kaihen-config.json`; `source-manifest.json` e gerado por `Preparar-Fontes-Kaihen.ps1` apos verificar todos os arquivos. Os hashes tornam o cache independente de alteracoes posteriores em tags remotas.
