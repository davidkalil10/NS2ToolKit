#include "types.h"
#include "svc.h"
#include "ipc.h"
#include "sm.h"
#include "hid.h"
#include "gfx.h"

// Formata um número inteiro em string decimal
static void int_to_str(s64 value, char *buf, size_t max_len) {
    if (max_len < 2) return;
    char temp[32];
    int pos = 0;
    bool negative = false;
    if (value < 0) {
        negative = true;
        value = -value;
    }
    if (value == 0) {
        temp[pos++] = '0';
    } else {
        while (value > 0 && pos < 30) {
            temp[pos++] = '0' + (value % 10);
            value /= 10;
        }
    }
    size_t out_idx = 0;
    if (negative && out_idx < max_len - 1) {
        buf[out_idx++] = '-';
    }
    while (pos > 0 && out_idx < max_len - 1) {
        buf[out_idx++] = temp[--pos];
    }
    buf[out_idx] = '\0';
}

// Ponto de entrada do Homebrew
// Recebe ponteiro de framebuffer (se fornecido pelo host), largura, altura e parâmetro extra
int main_entry(u64 fb_addr, u64 fb_width, u64 fb_height, u64 param) {
    (void)param;

    // Dimensões padrão (720p se não fornecidas)
    u32 width = (fb_width > 0) ? (u32)fb_width : 1280;
    u32 height = (fb_height > 0) ? (u32)fb_height : 720;

    // Se temos um buffer de vídeo válido, inicializamos o subsistema gráfico
    if (fb_addr != 0) {
        gfx_init((void *)fb_addr, width, height);
        gfx_clear(COLOR_DARK);
    }

    // Inicializa o Service Manager
    Result sm_res = sm_init();

    // Inicializa os controles (HID)
    Result hid_res = hid_init();

    // Loop principal (até pressionar o botão PLUS para sair ou 1800 frames = ~30s)
    u32 frame = 0;
    char str_buf[64];

    while (frame < 3600) {
        // Escaneia os botões e analógicos
        hid_scan_input();
        u64 keys_held = hid_keys_held();
        u64 keys_down = hid_keys_down();

        // Se o usuário apertar PLUS (+), sai do homebrew
        if (keys_down & KEY_PLUS) {
            break;
        }

        if (fb_addr != 0) {
            // Desenha a interface
            gfx_clear(COLOR_DARK);

            // Barra superior
            gfx_draw_rect(0, 0, width, 40, COLOR_ACCENT);
            gfx_draw_text(24, 14, "NINTENDO SWITCH 2 - HOMEBREW RUNNER (MINI-SDK)", COLOR_WHITE, 0);

            // Painel central de status
            gfx_draw_rect(24, 60, width - 48, 140, RGBA8(36, 36, 44, 255));
            gfx_draw_text(40, 75, "Estado dos Subsistemas:", COLOR_YELLOW, 0);

            if (R_SUCCEEDED(sm_res)) {
                gfx_draw_text(40, 100, "[ OK ] Service Manager (sm:) conectado", COLOR_GREEN, 0);
            } else {
                gfx_draw_text(40, 100, "[FAIL] Falha ao conectar ao sm:", COLOR_RED, 0);
            }

            if (R_SUCCEEDED(hid_res)) {
                gfx_draw_text(40, 125, "[ OK ] Human Interface Device (hid:) mapeado na memoria", COLOR_GREEN, 0);
            } else {
                gfx_draw_text(40, 125, "[FAIL] Falha ao mapear controles HID", COLOR_RED, 0);
            }

            gfx_draw_text(40, 150, "[ OK ] Framebuffer Linear ativo (1280x720 RGBA8)", COLOR_GREEN, 0);

            // Painel de Input / Joy-Con
            gfx_draw_rect(24, 220, width - 48, 200, RGBA8(36, 36, 44, 255));
            gfx_draw_text(40, 235, "Teste de Entrada (Pressione os botoes do console):", COLOR_YELLOW, 0);

            // Exibição dos botões pressionados
            u32 btn_x = 40;
            u32 btn_y = 270;
            const struct { u64 mask; const char *name; } buttons[] = {
                { KEY_A, "A" }, { KEY_B, "B" }, { KEY_X, "X" }, { KEY_Y, "Y" },
                { KEY_DUP, "UP" }, { KEY_DDOWN, "DOWN" }, { KEY_DLEFT, "LEFT" }, { KEY_DRIGHT, "RIGHT" },
                { KEY_L, "L" }, { KEY_R, "R" }, { KEY_ZL, "ZL" }, { KEY_ZR, "ZR" },
                { KEY_MINUS, "-" }, { KEY_PLUS, "+" }
            };

            for (int i = 0; i < 14; i++) {
                bool pressed = (keys_held & buttons[i].mask) != 0;
                u32 bg_color = pressed ? COLOR_GREEN : RGBA8(60, 60, 72, 255);
                u32 fg_color = pressed ? COLOR_BLACK : COLOR_WHITE;
                gfx_draw_rect(btn_x, btn_y, 44, 30, bg_color);
                gfx_draw_text(btn_x + 12, btn_y + 10, buttons[i].name, fg_color, 0);
                btn_x += 52;
            }

            // Exibição dos analógicos
            HidStick left, right;
            hid_get_sticks(&left, &right);

            gfx_draw_text(40, 320, "Stick Esquerdo: X=", COLOR_WHITE, 0);
            int_to_str(left.x, str_buf, sizeof(str_buf));
            gfx_draw_text(180, 320, str_buf, COLOR_YELLOW, 0);
            gfx_draw_text(260, 320, "Y=", COLOR_WHITE, 0);
            int_to_str(left.y, str_buf, sizeof(str_buf));
            gfx_draw_text(285, 320, str_buf, COLOR_YELLOW, 0);

            gfx_draw_text(40, 345, "Stick Direito:  X=", COLOR_WHITE, 0);
            int_to_str(right.x, str_buf, sizeof(str_buf));
            gfx_draw_text(180, 345, str_buf, COLOR_YELLOW, 0);
            gfx_draw_text(260, 345, "Y=", COLOR_WHITE, 0);
            int_to_str(right.y, str_buf, sizeof(str_buf));
            gfx_draw_text(285, 345, str_buf, COLOR_YELLOW, 0);

            // Instrução de saída no rodapé
            gfx_draw_rect(0, height - 36, width, 36, RGBA8(18, 18, 22, 255));
            gfx_draw_text(24, height - 24, "Pressione [+] para sair e retornar.", COLOR_WHITE, 0);
        }

        // Aguarda ~16.6ms para sincronizar a 60 FPS
        svcSleepThread(16666666ULL);
        frame++;
    }

    // Finaliza os serviços
    hid_exit();
    sm_exit();

    return 0;
}
