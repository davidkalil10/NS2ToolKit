#include "hid.h"
#include "sm.h"
#include "svc.h"
#include "ipc.h"

#define HID_SHMEM_SIZE 0x40000 // 256 KiB
#define HID_SHMEM_ADDR 0x10000000ULL

typedef struct {
    u64 sampling_number;
    u64 sampling_number2;
    u64 attributes;
    u64 buttons;
    s32 left_stick_x;
    s32 left_stick_y;
    s32 right_stick_x;
    s32 right_stick_y;
} __attribute__((packed)) HidControllerSample;

typedef struct {
    u64 sample_number;
    u64 sample_count;
    HidControllerSample samples[17];
} __attribute__((packed)) HidControllerRing;

static Handle s_hid_handle = INVALID_HANDLE;
static Handle s_applet_resource = INVALID_HANDLE;
static Handle s_shmem_handle = INVALID_HANDLE;
static void *s_shmem_addr = NULL;

static u64 s_keys_previous = 0;
static u64 s_keys_current = 0;
static HidStick s_left_stick = {0, 0};
static HidStick s_right_stick = {0, 0};

Result hid_init(void) {
    if (s_shmem_addr != NULL) return 0;

    Result res = sm_get_service("hid", &s_hid_handle);
    if (R_FAILED(res)) return res;

    // Command 0: CreateAppletResource(u64 aruid = 0)
    u64 aruid = 0;
    res = ipc_call_simple(s_hid_handle, 0, &aruid, sizeof(aruid), NULL, 0, &s_applet_resource);
    if (R_FAILED(res)) {
        svcCloseHandle(s_hid_handle);
        s_hid_handle = INVALID_HANDLE;
        return res;
    }

    // Command 0 no IAppletResource: GetSharedMemoryHandle()
    res = ipc_call_simple(s_applet_resource, 0, NULL, 0, NULL, 0, &s_shmem_handle);
    if (R_FAILED(res)) {
        svcCloseHandle(s_applet_resource);
        svcCloseHandle(s_hid_handle);
        s_applet_resource = INVALID_HANDLE;
        s_hid_handle = INVALID_HANDLE;
        return res;
    }

    // Mapeia a memória compartilhada no endereço virtual
    s_shmem_addr = (void *)HID_SHMEM_ADDR;
    res = svcMapSharedMemory(s_shmem_handle, s_shmem_addr, HID_SHMEM_SIZE, Perm_R);
    if (R_FAILED(res)) {
        s_shmem_addr = NULL;
        svcCloseHandle(s_shmem_handle);
        svcCloseHandle(s_applet_resource);
        svcCloseHandle(s_hid_handle);
        s_shmem_handle = INVALID_HANDLE;
        s_applet_resource = INVALID_HANDLE;
        s_hid_handle = INVALID_HANDLE;
        return res;
    }

    s_keys_previous = 0;
    s_keys_current = 0;
    return 0;
}

void hid_exit(void) {
    if (s_shmem_addr != NULL) {
        svcUnmapSharedMemory(s_shmem_handle, s_shmem_addr, HID_SHMEM_SIZE);
        s_shmem_addr = NULL;
    }
    if (s_shmem_handle != INVALID_HANDLE) {
        svcCloseHandle(s_shmem_handle);
        s_shmem_handle = INVALID_HANDLE;
    }
    if (s_applet_resource != INVALID_HANDLE) {
        svcCloseHandle(s_applet_resource);
        s_applet_resource = INVALID_HANDLE;
    }
    if (s_hid_handle != INVALID_HANDLE) {
        svcCloseHandle(s_hid_handle);
        s_hid_handle = INVALID_HANDLE;
    }
}

void hid_scan_input(void) {
    s_keys_previous = s_keys_current;

    if (!s_shmem_addr) {
        s_keys_current = 0;
        return;
    }

    // Localiza o ring buffer do Handheld / Player 1 (Offset 0x9A00 + 0x140)
    u8 *base = (u8 *)s_shmem_addr;
    HidControllerRing *ring = (HidControllerRing *)(base + 0x9A00 + 0x140);

    u64 count = ring->sample_count;
    if (count > 0) {
        u32 index = (u32)((count - 1) % 17);
        HidControllerSample *sample = &ring->samples[index];
        s_keys_current = sample->buttons;
        s_left_stick.x = sample->left_stick_x;
        s_left_stick.y = sample->left_stick_y;
        s_right_stick.x = sample->right_stick_x;
        s_right_stick.y = sample->right_stick_y;
    }
}

u64 hid_keys_held(void) {
    return s_keys_current;
}

u64 hid_keys_down(void) {
    return s_keys_current & ~s_keys_previous;
}

u64 hid_keys_up(void) {
    return s_keys_previous & ~s_keys_current;
}

void hid_get_sticks(HidStick *left, HidStick *right) {
    if (left) *left = s_left_stick;
    if (right) *right = s_right_stick;
}
