/*
 * CheerpX Character Device Inode Disambiguation Shim (i386 Linux)
 *
 * CheerpX's virtual /dev filesystem reports an identical st_ino for /dev/input/event0
 * (keyboard, 13:64) and /dev/input/event1 (mouse, 13:65). X.Org's xf86-input-evdev
 * driver rejects opening a second evdev device when (st_dev, st_ino) matches an
 * already-open device (EvdevDeviceIsDuplicate).
 *
 * Scoped strictly to Xorg via LD_PRELOAD, this tiny shim assigns a unique synthetic
 * st_ino derived from st_rdev for character devices so evdev opens both keyboard
 * (/dev/input/event0) and pointer (/dev/input/event1) simultaneously.
 */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <sys/stat.h>

static void fix_chr_ino(struct stat *st) {
    if (st && S_ISCHR(st->st_mode) && st->st_rdev != 0) {
        st->st_ino = (ino_t)(0x40000000UL | (unsigned long)st->st_rdev);
    }
}

int fstat(int fd, struct stat *st) {
    static int (*real_fstat)(int, struct stat *) = 0;
    if (!real_fstat) {
        real_fstat = dlsym(RTLD_NEXT, "fstat");
    }
    int rc = real_fstat(fd, st);
    if (rc == 0) {
        fix_chr_ino(st);
    }
    return rc;
}

int stat(const char *path, struct stat *st) {
    static int (*real_stat)(const char *, struct stat *) = 0;
    if (!real_stat) {
        real_stat = dlsym(RTLD_NEXT, "stat");
    }
    int rc = real_stat(path, st);
    if (rc == 0) {
        fix_chr_ino(st);
    }
    return rc;
}
