#ifndef HID_H
#define HID_H

#include "types.h"

#ifdef __cplusplus
extern "C" {
#endif

// Máscara de botões do Nintendo Switch
typedef enum {
    KEY_A            = (1ULL << 0),
    KEY_B            = (1ULL << 1),
    KEY_X            = (1ULL << 2),
    KEY_Y            = (1ULL << 3),
    KEY_LSTICK       = (1ULL << 4),
    KEY_RSTICK       = (1ULL << 5),
    KEY_L            = (1ULL << 6),
    KEY_R            = (1ULL << 7),
    KEY_ZL           = (1ULL << 8),
    KEY_ZR           = (1ULL << 9),
    KEY_PLUS         = (1ULL << 10),
    KEY_MINUS        = (1ULL << 11),
    KEY_DLEFT        = (1ULL << 12),
    KEY_DUP          = (1ULL << 13),
    KEY_DRIGHT       = (1ULL << 14),
    KEY_DDOWN        = (1ULL << 15),
    KEY_LSTICK_LEFT  = (1ULL << 16),
    KEY_LSTICK_UP    = (1ULL << 17),
    KEY_LSTICK_RIGHT = (1ULL << 18),
    KEY_LSTICK_DOWN  = (1ULL << 19),
    KEY_RSTICK_LEFT  = (1ULL << 20),
    KEY_RSTICK_UP    = (1ULL << 21),
    KEY_RSTICK_RIGHT = (1ULL << 22),
    KEY_RSTICK_DOWN  = (1ULL << 23),
    KEY_SL_LEFT      = (1ULL << 24),
    KEY_SR_LEFT      = (1ULL << 25),
    KEY_SL_RIGHT     = (1ULL << 26),
    KEY_SR_RIGHT     = (1ULL << 27),
    KEY_TOUCH        = (1ULL << 28)
} HidKeys;

typedef struct {
    s32 x;
    s32 y;
} HidStick;

typedef struct {
    u64 buttons_held;
    u64 buttons_pressed;
    u64 buttons_released;
    HidStick left_stick;
    HidStick right_stick;
} HidPadState;

// Inicializa o serviço HID e mapeia a memória compartilhada
Result hid_init(void);

// Encerra o serviço e desfaz o mapeamento da memória
void hid_exit(void);

// Atualiza o estado dos botões para o frame atual
void hid_scan_input(void);

// Obtém os botões atualmente pressionados
u64 hid_keys_held(void);

// Obtém os botões que acabaram de ser pressionados neste frame
u64 hid_keys_down(void);

// Obtém os botões que acabaram de ser soltos neste frame
u64 hid_keys_up(void);

// Obtém a posição dos analógicos
void hid_get_sticks(HidStick *left, HidStick *right);

#ifdef __cplusplus
}
#endif

#endif // HID_H
