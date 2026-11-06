#ifndef IPC_H
#define IPC_H

#include "types.h"
#include "svc.h"

#ifdef __cplusplus
extern "C" {
#endif

#define SFCI_MAGIC 0x49434653 // "SFCI" em little-endian
#define SFCO_MAGIC 0x4f434653 // "SFCO" em little-endian

typedef struct {
    u32 *buffer;
    u32 at_word;
    u32 data_word_start;
    u32 raw_bytes_written;
    u32 copy_handles_count;
    Handle copy_handles[8];
    bool send_pid;
} IpcMessage;

typedef struct {
    Result result;
    const void *data;
    size_t data_size;
    u32 copy_handles_count;
    Handle copy_handles[8];
    u32 move_handles_count;
    Handle move_handles[8];
} IpcParsedResponse;

// Inicializa a montagem de uma mensagem IPC no TLS atual
void ipc_init(IpcMessage *msg, u32 command_id);

// Adiciona cópia de handle na requisição
void ipc_add_copy_handle(IpcMessage *msg, Handle handle);

// Inclui o PID do processo atual no descritor de cabeçalho
void ipc_set_send_pid(IpcMessage *msg, bool send);

// Adiciona dados brutos ao payload da mensagem (após SFCI)
void ipc_write_data(IpcMessage *msg, const void *data, size_t size);

void ipc_write_u32(IpcMessage *msg, u32 value);
void ipc_write_u64(IpcMessage *msg, u64 value);

// Finaliza o cabeçalho e calcula o tamanho total
void ipc_finalize(IpcMessage *msg);

// Envia a mensagem síncrona para a sessão do serviço
Result ipc_send(Handle session, IpcMessage *msg);

// Analisa a resposta recebida no buffer TLS
Result ipc_parse(IpcParsedResponse *resp);

// Wrapper conveniente para requisições simples com dados de entrada e saída
Result ipc_call_simple(Handle session, u32 command_id,
                       const void *in_data, size_t in_size,
                       void *out_data, size_t out_size,
                       Handle *out_handle);

#ifdef __cplusplus
}
#endif

#endif // IPC_H
