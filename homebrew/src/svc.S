.section .text,"ax",%progbits

.global svcSetHeapSize
.type svcSetHeapSize, %function
svcSetHeapSize:
    bti c
    mov x2, x0
    mov x0, x1
    svc #0x01
    cbz w0, 1f
    ret
1:
    str x1, [x2]
    ret

.global svcQueryMemory
.type svcQueryMemory, %function
svcQueryMemory:
    bti c
    mov x2, x1
    svc #0x06
    mov w0, w0
    mov w1, w1
    ret

.global svcSleepThread
.type svcSleepThread, %function
svcSleepThread:
    bti c
    svc #0x0b
    ret

.global svcCloseHandle
.type svcCloseHandle, %function
svcCloseHandle:
    bti c
    svc #0x16
    ret

.global svcWaitSynchronization
.type svcWaitSynchronization, %function
svcWaitSynchronization:
    bti c
    mov x3, x2
    mov x2, x1
    mov x1, x0
    svc #0x18
    mov w0, w0
    mov w1, w1
    ret

.global svcCancelSynchronization
.type svcCancelSynchronization, %function
svcCancelSynchronization:
    bti c
    svc #0x19
    ret

.global svcGetSystemTick
.type svcGetSystemTick, %function
svcGetSystemTick:
    bti c
    svc #0x1e
    ret

.global svcConnectToNamedPort
.type svcConnectToNamedPort, %function
svcConnectToNamedPort:
    bti c
    mov x1, x0
    svc #0x1f
    mov w0, w0
    mov w1, w1
    ret

.global svcSendSyncRequest
.type svcSendSyncRequest, %function
svcSendSyncRequest:
    bti c
    svc #0x21
    ret

.global svcGetProcessId
.type svcGetProcessId, %function
svcGetProcessId:
    bti c
    mov w1, w0
    svc #0x24
    mov w0, w0
    ret

.global svcGetThreadId
.type svcGetThreadId, %function
svcGetThreadId:
    bti c
    mov w1, w0
    svc #0x25
    mov w0, w0
    ret

.global svcBreak
.type svcBreak, %function
svcBreak:
    bti c
    svc #0x27
    ret

.global svcGetInfo
.type svcGetInfo, %function
svcGetInfo:
    bti c
    mov x3, x2
    mov w2, w1
    mov w1, w0
    svc #0x29
    mov w0, w0
    ret

.global svcMapSharedMemory
.type svcMapSharedMemory, %function
svcMapSharedMemory:
    bti c
    svc #0x2d
    ret

.global svcUnmapSharedMemory
.type svcUnmapSharedMemory, %function
svcUnmapSharedMemory:
    bti c
    svc #0x2e
    ret

.global svcAcceptSession
.type svcAcceptSession, %function
svcAcceptSession:
    bti c
    mov w1, w0
    svc #0x41
    mov w0, w0
    mov w1, w1
    ret

.global svcReplyAndReceive
.type svcReplyAndReceive, %function
svcReplyAndReceive:
    bti c
    mov x4, x3
    mov x3, x2
    mov x2, x1
    mov x1, x0
    svc #0x43
    mov w0, w0
    mov w1, w1
    ret

.global svcSetProcessMemoryPermission
.type svcSetProcessMemoryPermission, %function
svcSetProcessMemoryPermission:
    bti c
    svc #0x73
    ret

.global svcMapProcessMemory
.type svcMapProcessMemory, %function
svcMapProcessMemory:
    bti c
    svc #0x74
    ret

.global svcUnmapProcessMemory
.type svcUnmapProcessMemory, %function
svcUnmapProcessMemory:
    bti c
    svc #0x75
    ret

.global svcQueryProcessMemory
.type svcQueryProcessMemory, %function
svcQueryProcessMemory:
    bti c
    mov x3, x2
    mov w2, w1
    svc #0x76
    mov w0, w0
    mov w1, w1
    ret

.global svcMapProcessCodeMemory
.type svcMapProcessCodeMemory, %function
svcMapProcessCodeMemory:
    bti c
    svc #0x77
    ret

.global svcUnmapProcessCodeMemory
.type svcUnmapProcessCodeMemory, %function
svcUnmapProcessCodeMemory:
    bti c
    svc #0x78
    ret
