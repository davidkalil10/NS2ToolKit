#ifndef SM_H
#define SM_H

#include "types.h"

#ifdef __cplusplus
extern "C" {
#endif

// Inicializa a conexão com o Service Manager (sm:)
Result sm_init(void);

// Encerra a conexão com o Service Manager
void sm_exit(void);

// Obtém o handle de uma sessão para um serviço registrado (ex: "hid", "vi:m", "fsp-srv")
Result sm_get_service(const char *name, Handle *out_handle);

// Retorna se o SM já está conectado e pronto
bool sm_is_initialized(void);

#ifdef __cplusplus
}
#endif

#endif // SM_H
