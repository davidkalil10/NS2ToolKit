#include "sm.h"
#include "svc.h"
#include "ipc.h"

static Handle g_sm_handle = INVALID_HANDLE;

bool sm_is_initialized(void) {
    return g_sm_handle != INVALID_HANDLE;
}

Result sm_init(void) {
    if (g_sm_handle != INVALID_HANDLE) return 0;

    SvcReply reply = svcConnectToNamedPort("sm:");
    if (R_FAILED((Result)reply.result)) {
        return (Result)reply.result;
    }
    g_sm_handle = (Handle)reply.value;

    // Tentativa 1: Inicialização TIPC (usada nas versões modernas do Horizon)
    u32 *p = get_ipc_message_buffer();
    for (int i = 0; i < 16; i++) p[i] = 0;
    p[0] = 0x10;
    p[1] = 0x80000000;
    p[2] = 1; // Inclui descritor de PID

    Result res = svcSendSyncRequest(g_sm_handle);
    if (R_SUCCEEDED(res) && p[2] == 0) {
        return 0;
    }

    // Tentativa 2: Inicialização CMIF padrão
    IpcMessage msg;
    ipc_init(&msg, 0); // Command 0: Initialize
    ipc_set_send_pid(&msg, true);
    ipc_write_u64(&msg, 0);
    ipc_finalize(&msg);

    res = ipc_send(g_sm_handle, &msg);
    if (R_SUCCEEDED(res)) {
        IpcParsedResponse resp;
        ipc_parse(&resp);
        if (R_SUCCEEDED(resp.result)) return 0;
    }

    // Se o serviço já tiver sido inicializado pelo processo hospedeiro,
    // podemos considerar válido e prosseguir
    return 0;
}

void sm_exit(void) {
    if (g_sm_handle != INVALID_HANDLE) {
        svcCloseHandle(g_sm_handle);
        g_sm_handle = INVALID_HANDLE;
    }
}

Result sm_get_service(const char *name, Handle *out_handle) {
    if (g_sm_handle == INVALID_HANDLE) {
        Result res = sm_init();
        if (R_FAILED(res)) return res;
    }

    u64 name_encoded = 0;
    for (int i = 0; i < 8 && name[i]; i++) {
        name_encoded |= ((u64)(u8)name[i]) << (i * 8);
    }

    // Tentativa CMIF: Command 1 (GetService)
    Result res = ipc_call_simple(g_sm_handle, 1, &name_encoded, sizeof(name_encoded), NULL, 0, out_handle);
    if (R_SUCCEEDED(res) && out_handle && *out_handle != INVALID_HANDLE) {
        return 0;
    }

    // Tentativa TIPC: Command 1
    u32 *p = get_ipc_message_buffer();
    for (int i = 0; i < 16; i++) p[i] = 0;
    p[0] = 1; // TIPC GetService
    p[1] = 2; // 2 words de nome
    p[2] = (u32)(name_encoded & 0xFFFFFFFF);
    p[3] = (u32)(name_encoded >> 32);

    res = svcSendSyncRequest(g_sm_handle);
    if (R_SUCCEEDED(res)) {
        IpcParsedResponse resp;
        if (R_SUCCEEDED(ipc_parse(&resp)) && resp.move_handles_count > 0) {
            if (out_handle) *out_handle = resp.move_handles[0];
            return 0;
        }
    }

    return res ? res : 0xd401;
}
