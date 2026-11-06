ENTRY(_start)

PHDRS {
    text PT_LOAD FLAGS(5);   /* R-X (Read + Execute) */
    rodata PT_LOAD FLAGS(4); /* R-- (Read-Only) */
    data PT_LOAD FLAGS(6);   /* RW- (Read + Write) */
}

SECTIONS {
    . = 0;
    .text : { 
        KEEP(*(.text.start)) 
        *(.text .text.*) 
    } :text
    . = ALIGN(0x1000);
    .rodata : { 
        *(.rodata .rodata.*) 
    } :rodata
    . = ALIGN(0x1000);
    .data : { 
        *(.data .data.*) 
    } :data
    . = ALIGN(0x1000);
    __bss_start = .;
    .bss (NOLOAD) : { 
        *(.bss .bss.* COMMON) 
    } :data
    __bss_end = .;
    /DISCARD/ : { 
        *(.comment .note* .eh_frame*) 
    }
}
