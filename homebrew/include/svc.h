#ifndef SVC_H
#define SVC_H

#include "types.h"

#ifdef __cplusplus
extern "C" {
#endif

// Kernel Horizon Syscalls (AArch64)

Result   svcSetHeapSize(void **out_addr, u64 size);
Result   svcQueryMemory(MemoryInfo *info, u64 address);
void     svcSleepThread(s64 nanoseconds);
Result   svcCloseHandle(Handle handle);
SvcReply svcWaitSynchronization(const Handle *handles, u32 count, s64 timeout);
Result   svcCancelSynchronization(Handle handle);
u64      svcGetSystemTick(void);
SvcReply svcConnectToNamedPort(const char *name);
Result   svcSendSyncRequest(Handle session);
SvcReply svcGetProcessId(Handle process);
SvcReply svcGetThreadId(Handle thread);
void     svcBreak(u32 reason, u64 arg, u64 size);
SvcReply svcGetInfo(u32 type, Handle handle, u64 subtype);
Result   svcMapSharedMemory(Handle handle, void *address, u64 size, u32 permission);
Result   svcUnmapSharedMemory(Handle handle, void *address, u64 size);
SvcReply svcAcceptSession(Handle port);
SvcReply svcReplyAndReceive(const Handle *handles, u32 count, Handle reply_target, s64 timeout);

// Extended Process & Code Memory Syscalls
Result   svcSetProcessMemoryPermission(Handle process, u64 address, u64 size, u32 perm);
Result   svcMapProcessMemory(u64 dst_addr, Handle process, u64 src_addr, u64 size);
Result   svcUnmapProcessMemory(u64 dst_addr, Handle process, u64 src_addr, u64 size);
Result   svcQueryProcessMemory(MemoryInfo *info, Handle process, u64 address);
Result   svcMapProcessCodeMemory(Handle process, u64 dst_addr, u64 src_addr, u64 size);
Result   svcUnmapProcessCodeMemory(Handle process, u64 dst_addr, u64 src_addr, u64 size);

// Thread Local Storage IPC Buffer helper
static inline u32 *get_ipc_message_buffer(void) {
    u32 *p;
    __asm__ volatile("mrs %0, tpidrro_el0" : "=r"(p));
    return p;
}

#ifdef __cplusplus
}
#endif

#endif // SVC_H
