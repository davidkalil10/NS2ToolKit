#ifndef TYPES_H
#define TYPES_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

typedef uint8_t  u8;
typedef uint16_t u16;
typedef uint32_t u32;
typedef uint64_t u64;

typedef int8_t   s8;
typedef int16_t  s16;
typedef int32_t  s32;
typedef int64_t  s64;

typedef u32 Handle;
typedef u32 Result;

#define INVALID_HANDLE   ((Handle)0)
#define CURRENT_PROCESS  ((Handle)0xffff8001)
#define CURRENT_THREAD   ((Handle)0xffff8000)

#define R_SUCCEEDED(res) ((res) == 0)
#define R_FAILED(res)    ((res) != 0)
#define R_MODULE(res)    ((res) & 0x1ff)
#define R_DESCRIPTION(res) (((res) >> 9) & 0x1fff)

// Resposta com dois registradores de retorno (x0 = result, x1 = value)
typedef struct {
    u64 result;
    u64 value;
} SvcReply;

typedef struct {
    u64 address;
    u64 size;
    u32 type;
    u32 attributes;
    u32 permission;
    u32 ipc_refs;
    u32 device_refs;
    u32 padding;
} MemoryInfo;

// Permissões de memória Horizon
typedef enum {
    Perm_None = 0,
    Perm_R    = 1,
    Perm_W    = 2,
    Perm_RW   = 3,
    Perm_X    = 4,
    Perm_RX   = 5,
    Perm_RWX  = 7
} MemoryPermission;

#endif // TYPES_H
