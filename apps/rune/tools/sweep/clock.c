// Capture-only wall-clock interposer. Monotonic time (network timeouts) remains real.
#include <time.h>
#include <sys/time.h>
#include <stdlib.h>
#include <stdint.h>
#include <dlfcn.h>
static int64_t now_ms(void) { return atoll(getenv("OCR_FIXTURE_NOW")); }
static int fixed_clock_gettime(clockid_t id, struct timespec *out) {
    if (id == CLOCK_REALTIME) {
        int64_t ms = now_ms(); out->tv_sec = ms / 1000; out->tv_nsec = (ms % 1000) * 1000000;
        return 0;
    }
    return clock_gettime(id, out);
}
static int fixed_gettimeofday(struct timeval *out, void *zone) {
    (void)zone; int64_t ms = now_ms(); out->tv_sec = ms / 1000; out->tv_usec = (ms % 1000) * 1000;
    return 0;
}
#define INTERPOSE(new, old) __attribute__((used)) static struct { const void *replacement; const void *replacee; } pair_##old __attribute__((section("__DATA,__interpose"))) = { (const void *)(uintptr_t)&new, (const void *)(uintptr_t)&old };
#ifndef SWEEP_CLOCK_PROBE
INTERPOSE(fixed_clock_gettime, clock_gettime)
INTERPOSE(fixed_gettimeofday, gettimeofday)
#else
#include <stdio.h>
#include <unistd.h>
int main(void) {
    struct timespec wall, before, after;
    struct timeval tv;
    clock_gettime(CLOCK_REALTIME, &wall);
    gettimeofday(&tv, NULL);
    clock_gettime(CLOCK_MONOTONIC, &before);
    usleep(20000);
    clock_gettime(CLOCK_MONOTONIC, &after);
    if (wall.tv_sec * 1000 + wall.tv_nsec / 1000000 != now_ms() ||
        tv.tv_sec * 1000 + tv.tv_usec / 1000 != now_ms() ||
        (after.tv_sec == before.tv_sec && after.tv_nsec <= before.tv_nsec)) return 1;
    puts("realtime frozen; monotonic advances");
    return 0;
}
#endif
