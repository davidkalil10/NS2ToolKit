#include "ipc.h"

static void memory_copy(void *dest, const void *src, size_t n) {
    u8 *d = (u8 *)dest;
    const u8 *s = (const u8 *)src;
    for (size_t i = 0; i < n; i++) d[i] = s[i];
}

static void memory_set(void *dest, u8 val, size_t n) {
    u8 *d = (u8 *)dest;
    for (size_t i = 0; i < n; i++) d[i] = val;
}

void ipc_init(IpcMessage *msg, u32 command_id) {
    msg->buffer = get_ipc_message_buffer();
    memory_set(msg->buffer, 0, 64 * sizeof(u32));
    msg->copy_handles_count = 0;
    msg->send_pid = false;
    msg->raw_bytes_written = 0;

    // Começamos o layout após os dois words de cabeçalho
    u32 at = 2;

    // Descriptores especiais se houverem
    msg->at_word = at;

    // Reservamos espaço para o cabeçalho SFCI (alinhado em 16 bytes / 4 words)
    msg->data_word_start = 4; // será ajustado no finalize
    
    // Guardamos o command_id temporariamente no início da área de dados
    msg->buffer[16] = command_id;
}

void ipc_add_copy_handle(IpcMessage *msg, Handle handle) {
    if (msg->copy_handles_count < 8) {
        msg->copy_handles[msg->copy_handles_count++] = handle;
    }
}

void ipc_set_send_pid(IpcMessage *msg, bool send) {
    msg->send_pid = send;
}

void ipc_write_data(IpcMessage *msg, const void *data, size_t size) {
    u8 *data_dest = (u8 *)&msg->buffer[msg->data_word_start + 4];
    memory_copy(data_dest + msg->raw_bytes_written, data, size);
    msg->raw_bytes_written += (u32)size;
}

void ipc_write_u32(IpcMessage *msg, u32 value) {
    ipc_write_data(msg, &value, sizeof(u32));
}

void ipc_write_u64(IpcMessage *msg, u64 value) {
    ipc_write_data(msg, &value, sizeof(u64));
}

void ipc_finalize(IpcMessage *msg) {
    u32 at = 2;
    bool has_special = msg->send_pid || (msg->copy_handles_count > 0);

    if (has_special) {
        u32 special = (msg->send_pid ? 1 : 0) | (msg->copy_handles_count << 1);
        msg->buffer[at++] = special;
        if (msg->send_pid) at += 2; // Kernel preencherá com PID
        for (u32 i = 0; i < msg->copy_handles_count; i++) {
            msg->buffer[at++] = msg->copy_handles[i];
        }
    }

    // Alinhamento em 16 bytes (múltiplo de 4 words)
    at = (at + 3) & ~3u;
    msg->data_word_start = at;

    u32 cmd_id = msg->buffer[16]; // recupera command_id

    // Escreve cabeçalho SFCI
    msg->buffer[at + 0] = SFCI_MAGIC;
    msg->buffer[at + 1] = 0;
    msg->buffer[at + 2] = cmd_id;
    msg->buffer[at + 3] = 0;

    // Cabeçalho geral
    msg->buffer[0] = 4; // Request Tipo 4 (CMIF)
    u32 raw_words = (16 + msg->raw_bytes_written + 3) / 4;
    u32 total_raw_words = (at - 2) + raw_words;
    msg->buffer[1] = total_raw_words | (has_special ? 0x80000000 : 0);
}

Result ipc_send(Handle session, IpcMessage *msg) {
    (void)msg;
    return svcSendSyncRequest(session);
}

Result ipc_parse(IpcParsedResponse *resp) {
    u32 *p = get_ipc_message_buffer();
    u32 first = p[0];
    u32 second = p[1];
    u32 at = 2;

    resp->result = 0xFFFFFFFF;
    resp->copy_handles_count = 0;
    resp->move_handles_count = 0;
    resp->data = NULL;
    resp->data_size = 0;

    if (second & 0x80000000) {
        u32 special = p[at++];
        if (special & 1) at += 2; // PID
        u32 copies = (special >> 1) & 15;
        for (u32 i = 0; i < copies && i < 8; i++) {
            resp->copy_handles[resp->copy_handles_count++] = p[at++];
        }
        u32 moves = (special >> 5) & 15;
        for (u32 i = 0; i < moves && i < 8; i++) {
            resp->move_handles[resp->move_handles_count++] = p[at++];
        }
    }

    // Pula descritores normais se houverem
    at += ((first >> 16) & 15) * 2;
    at += (((first >> 20) & 15) + ((first >> 24) & 15) + ((first >> 28) & 15)) * 3;
    at = (at + 3) & ~3u;

    if (p[at] != SFCO_MAGIC) {
        return 0xd401; // Resposta inválida / Bad Input
    }

    resp->result = p[at + 2];
    resp->data = (const void *)&p[at + 4];
    return resp->result;
}

Result ipc_call_simple(Handle session, u32 command_id,
                       const void *in_data, size_t in_size,
                       void *out_data, size_t out_size,
                       Handle *out_handle) {
    IpcMessage msg;
    ipc_init(&msg, command_id);
    if (in_data && in_size > 0) {
        ipc_write_data(&msg, in_data, in_size);
    }
    ipc_finalize(&msg);

    Result res = ipc_send(session, &msg);
    if (R_FAILED(res)) return res;

    IpcParsedResponse resp;
    res = ipc_parse(&resp);
    if (R_FAILED(res)) return res;

    if (out_data && out_size > 0 && resp.data) {
        memory_copy(out_data, resp.data, out_size);
    }
    if (out_handle) {
        if (resp.move_handles_count > 0) {
            *out_handle = resp.move_handles[0];
        } else if (resp.copy_handles_count > 0) {
            *out_handle = resp.copy_handles[0];
        } else {
            *out_handle = INVALID_HANDLE;
        }
    }

    return resp.result;
}
