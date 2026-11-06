.section .text.start,"ax",%progbits
.global _start
.type _start, %function
_start:
    bti c
    // Argumentos x0, x1, x2, x3 são preservados para main_entry
    // Chama main_entry(fb_addr, width, height, param)
    b main_entry
