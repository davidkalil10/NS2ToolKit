#ifndef GFX_H
#define GFX_H

#include "types.h"

#ifdef __cplusplus
extern "C" {
#endif

#define RGBA8(r, g, b, a) (((u32)(a) << 24) | ((u32)(b) << 16) | ((u32)(g) << 8) | ((u32)(r)))

#define COLOR_BLACK   RGBA8(0, 0, 0, 255)
#define COLOR_WHITE   RGBA8(255, 255, 255, 255)
#define COLOR_RED     RGBA8(235, 64, 52, 255)
#define COLOR_GREEN   RGBA8(66, 186, 92, 255)
#define COLOR_BLUE    RGBA8(52, 143, 235, 255)
#define COLOR_YELLOW  RGBA8(245, 194, 66, 255)
#define COLOR_DARK    RGBA8(24, 24, 28, 255)
#define COLOR_ACCENT  RGBA8(130, 80, 255, 255)

typedef struct {
    u32 *pixels;
    u32 width;
    u32 height;
    u32 stride;
} Framebuffer;

// Inicializa o contexto gráfico com um buffer de pixels linear
void gfx_init(void *buffer, u32 width, u32 height);

// Limpa todo o framebuffer com uma cor sólida
void gfx_clear(u32 color);

// Desenha um pixel nas coordenadas (x, y)
void gfx_draw_pixel(u32 x, u32 y, u32 color);

// Desenha um retângulo preenchido
void gfx_draw_rect(u32 x, u32 y, u32 w, u32 h, u32 color);

// Desenha um caractere 8x8 na tela
void gfx_draw_char(u32 x, u32 y, char c, u32 fg, u32 bg);

// Desenha uma string de texto na tela
void gfx_draw_text(u32 x, u32 y, const char *str, u32 fg, u32 bg);

// Retorna o ponteiro do framebuffer atual
Framebuffer *gfx_get_framebuffer(void);

#ifdef __cplusplus
}
#endif

#endif // GFX_H
