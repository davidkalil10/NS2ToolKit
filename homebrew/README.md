# Nintendo Switch 2 - Mini-SDK & Homebrew Environment

Ambiente leve de desenvolvimento de Homebrews em C e Assembly AArch64 para o Nintendo Switch 2 (Horizon OS 23.0.1).

---

## 📁 Estrutura do Projeto

```
homebrew/
├── include/
│   ├── types.h        # Tipos fundamentais (u8, u32, u64, Handle, Result, MemoryInfo)
│   ├── svc.h          # Tabela e declarações de Syscalls (SVCs do Kernel Horizon)
│   ├── ipc.h          # Protocolo CMIF/TIPC (SFCI / SFCO) para comunicação com serviços
│   ├── sm.h           # Cliente do Service Manager (sm: para registrar e obter serviços)
│   ├── hid.h          # Human Interface Device (Leitura de botões e analógicos via Shared Memory)
│   └── gfx.h          # Framebuffer Linear RGBA8 e renderizador de texto com fonte 8x8
├── src/
│   ├── start.S        # Ponto de entrada AArch64 com instrução BTI (Branch Target Identification)
│   ├── svc.S          # Implementação das instruções SVC em AArch64
│   ├── ipc.c          # Empacotador e parser de mensagens IPC
│   ├── sm.c           # Conexão e lookup de serviços no Horizon OS
│   ├── hid.c          # Mapeamento e decodificação do buffer circular dos Joy-Cons
│   ├── gfx.c          # Blitter de pixels, desenho de formas e fonte bitmap ASCII
│   └── main.c         # Demonstração interativa de vídeo e controles
├── layout.ld          # Linker script freestanding alinhado por páginas (4KB)
└── build.cjs          # Script de automação de compilação (gera ELF, BIN e NSO)
```

---

## 🛠️ Como Compilar

O projeto utiliza o compilador oficial **devkitA64 GCC 16.1.0** (já instalado em `C:\devkitPro\devkitA64`):

```bash
node homebrew/build.cjs
```

### Saídas Geradas:
1. **`homebrew.elf`**: Binário executável ELF AArch64 com suporte a BTI (`-mbranch-protection=standard`).
2. **`homebrew.bin`**: Imagem binária plana (*flat binary*) pronta para injeção direta em memória.
3. **`homebrew.nso`**: Pacote oficial no formato NSO do Horizon OS (gerado através do `packageNso`).

---

## 🎮 Recursos Implementados

### 1. Syscalls & IPC (`svc.h`, `ipc.h`, `sm.h`)
- Chamadas de sistema diretas para controle de threads, memória e IPC:
  - `svcSendSyncRequest`, `svcConnectToNamedPort`, `svcMapSharedMemory`, etc.
- Compatibilidade automática com os protocolos **CMIF** e **TIPC**.
- Obtenção dinâmica de qualquer serviço do sistema através de `sm_get_service("nome", &handle)`.

### 2. Leitura de Controles (`hid.h`)
- Mapeia a **Shared Memory** do HID (`0x40000` bytes) via `svcMapSharedMemory`.
- Leitura instantânea sem custo de IPC por frame:
  - Botões: `A`, `B`, `X`, `Y`, `D-Pad`, `L`, `R`, `ZL`, `ZR`, `+`, `-`.
  - Analógicos: valores normalizados dos eixos X e Y para os Joy-Cons esquerdo e direito.

### 3. Framebuffer & Gráficos 2D (`gfx.h`)
- Buffer linear de pixels em formato **RGBA8888** (32 bits por pixel).
- Primitivas gráficas: `gfx_clear`, `gfx_draw_pixel`, `gfx_draw_rect`.
- Renderizador de texto bitmap embutido (fonte ASCII 8x8) para desenhar logs e interfaces sem dependências externas.
