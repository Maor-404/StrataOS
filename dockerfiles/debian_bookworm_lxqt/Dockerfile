FROM --platform=linux/386 i386/debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install lean Debian 12 Bookworm real X11 + Openbox + LXQt-panel stack (--no-install-recommends)
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    dbus-x11 \
    fonts-dejavu-core \
    htop \
    lxqt-config \
    lxqt-panel \
    lxqt-qtplugin \
    lxqt-themes \
    nano \
    neofetch \
    openbox \
    papirus-icon-theme \
    pcmanfm-qt \
    procps \
    qterminal \
    sudo \
    udev \
    x11-xserver-utils \
    xinit \
    xorg \
    xserver-xorg-input-evdev \
    xserver-xorg-input-kbd \
    xserver-xorg-input-libinput \
    xserver-xorg-input-mouse \
    xserver-xorg-legacy \
    xserver-xorg-video-fbdev \
    xterm \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Ensure D-Bus machine-id, fast DejaVu fontconfig, and X11 non-root permissions for CheerpX
RUN mkdir -p /var/lib/dbus /etc/X11/xorg.conf.d /tmp/.X11-unix /var/log /var/cache/fontconfig \
 && dbus-uuidgen > /etc/machine-id \
 && ln -sf /etc/machine-id /var/lib/dbus/machine-id \
 && chmod 1777 /tmp /tmp/.X11-unix \
 && printf 'allowed_users=anybody\nneeds_root_rights=yes\n' > /etc/X11/Xwrapper.config \
 && if [ -f /usr/lib/xorg/Xorg ]; then chmod u+s /usr/lib/xorg/Xorg; fi

# Minimal fast fontconfig pointing straight to DejaVu (avoids scanning legacy X11 bitmap PCF fonts)
RUN cat <<'FCEOF' > /etc/fonts/strata-fonts.conf
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>/usr/share/fonts/truetype/dejavu</dir>
  <cachedir>/var/cache/fontconfig</cachedir>
  <cachedir>/tmp/strata-fc-cache</cachedir>
  <alias><family>sans-serif</family><prefer><family>DejaVu Sans</family></prefer></alias>
  <alias><family>serif</family><prefer><family>DejaVu Serif</family></prefer></alias>
  <alias><family>monospace</family><prefer><family>DejaVu Sans Mono</family></prefer></alias>
</fontconfig>
FCEOF
RUN FONTCONFIG_FILE=/etc/fonts/strata-fonts.conf fc-cache -f

# CheerpX KMS modesetting (AccelMethod none skips 110 MiB Mesa/LLVMpipe glamor) + kbd/evdev input
RUN cat <<'XORGEOF' > /etc/X11/xorg.conf
Section "ServerFlags"
  Option "AutoAddDevices" "false"
  Option "AutoEnableDevices" "false"
EndSection

Section "Device"
  Identifier "CheerpX KMS"
  Driver "modesetting"
  Option "AccelMethod" "none"
  Option "ShadowFB" "true"
EndSection

Section "Screen"
  Identifier "CheerpX Screen"
  Device "CheerpX KMS"
EndSection

Section "InputDevice"
  Identifier "CheerpX Keyboard"
  Driver "kbd"
  Option "Protocol" "standard"
  Option "XkbModel" "pc105"
  Option "XkbLayout" "us"
EndSection

Section "InputDevice"
  Identifier "CheerpX Pointer"
  Driver "evdev"
  Option "Device" "/dev/input/event1"
EndSection

Section "ServerLayout"
  Identifier "CheerpX Layout"
  Screen 0 "CheerpX Screen"
  InputDevice "CheerpX Keyboard" "CoreKeyboard"
  InputDevice "CheerpX Pointer" "CorePointer"
EndSection
XORGEOF

# Create non-root user `strata` (uid 1000, password `strata`, passwordless sudo)
RUN useradd -m -u 1000 -s /bin/bash -G sudo,video,input,tty strata \
 && echo "strata:strata" | chpasswd \
 && echo "root:strata" | chpasswd \
 && mkdir -p /etc/sudoers.d \
 && echo "strata ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/strata \
 && chmod 0440 /etc/sudoers.d/strata

# StrataOS Debian 12 branding & authentic CLI fetch utility
RUN printf 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm) — StrataOS LXQt/Openbox"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nVERSION_CODENAME=bookworm\nID=debian\nHOME_URL="https://strata-os.pages.dev"\n' > /etc/os-release

RUN cat <<'EOF' > /usr/local/bin/stratafetch
#!/bin/bash
printf "\033[1;35m   _____ __             __        ____  _____\033[0m\n"
printf "\033[1;35m  / ___// /__________ _/ /_____ _/ __ \/ ___/\033[0m\n"
printf "\033[1;36m  \__ \/ __/ ___/ __ \`/ __/ __ \`/ / / /\__ \ \033[0m\n"
printf "\033[1;36m ___/ / /_/ /  / /_/ / /_/ /_/ / /_/ /___/ / \033[0m\n"
printf "\033[1;36m/____/\__/_/   \__,_/\__/\__,_/\____//____/  \033[0m\n\n"
printf "\033[1;37m  OS:\033[0m       Debian GNU/Linux 12 (Bookworm i386) — StrataOS\n"
printf "\033[1;37m  Kernel:\033[0m   %s\n" "$(uname -sr)"
printf "\033[1;37m  Desktop:\033[0m  X.Org X11 + Openbox + LXQt-panel + PCManFM-Qt\n"
printf "\033[1;37m  Engine:\033[0m   CheerpX x86 JIT + OPFS SyncAccessHandle + WebGPU Blitter\n"
printf "\033[1;37m  User:\033[0m     %s@%s (sudo password: strata)\n\n" "$(whoami)" "$(hostname)"
printf "\033[0;90m  Try: neofetch | htop | nano | pcmanfm-qt & | sudo apt update\033[0m\n"
EOF
RUN chmod +x /usr/local/bin/stratafetch

# Desktop launcher for StrataOS Terminal (xterm configured with dark TrueType StrataOS theme)
RUN cat <<'EOF' > /usr/share/applications/strata-terminal.desktop
[Desktop Entry]
Type=Application
Name=Strata Terminal
GenericName=Terminal Emulator
Comment=Debian 12 Bookworm Interactive Shell
Exec=xterm -title "StrataOS — Debian 12 Bookworm" -e /bin/bash -lc "stratafetch; exec /bin/bash -i"
Icon=utilities-terminal
Terminal=false
Categories=System;TerminalEmulator;
EOF

# Pre-configure dark LXQt + Openbox + PCManFM-Qt + QTerminal + XTerm profile (zero compositor lag)
RUN mkdir -p \
    /home/strata/.config/lxqt \
    /home/strata/.config/openbox \
    /home/strata/.config/pcmanfm-qt/lxqt \
    /home/strata/.config/qterminal.org \
    /home/strata/.local/share/xorg \
    /home/strata/Desktop

RUN cat <<'EOF' > /home/strata/.config/lxqt/lxqt.conf
[General]
__userfile__=true
icon_follow_color_scheme=true
icon_theme=Papirus-Dark
single_click_activate=false
theme=dark

[Qt]
font="DejaVu Sans,10,-1,5,50,0,0,0,0,0"
style=Fusion

[Palette]
base_color=#161b22
highlight_color=#d70a53
highlighted_text_color=#ffffff
link_color=#38bdf8
link_visited_color=#a78bfa
text_color=#e6edf3
window_color=#0d1117
window_text_color=#e6edf3
EOF

RUN cat <<'EOF' > /home/strata/.config/lxqt/panel.conf
[General]
__userfile__=true
panels=panel1

[panel1]
alignment=0
animation-duration=0
background-color=@Variant(\0\0\0\x43\x1\xff\xff\x0d\x0d\x11\x11\x17\x17\0\0)
background-opacity=100
desktop=0
font-color=@Variant(\0\0\0\x43\x1\xff\xff\xe6\xe6\xed\xed\xf3\xf3\0\0)
hidable=false
iconSize=22
lineCount=1
panelSize=36
plugins=mainmenu, quicklaunch, taskbar, spacer, tray, worldclock
position=Bottom
reserve-space=true
width=100
width-percent=true

[mainmenu]
type=mainmenu
text=StrataOS
showText=true

[quicklaunch]
type=quicklaunch
apps\1\desktop=/usr/share/applications/strata-terminal.desktop
apps\2\desktop=/usr/share/applications/pcmanfm-qt.desktop
apps\size=2

[taskbar]
type=taskbar
buttonStyle=IconText
groupingEnabled=true
raiseOnCurrentDesktop=true

[spacer]
type=spacer
size=8
spaceType=lined

[tray]
type=tray

[worldclock]
type=worldclock
formatType=short-timeonly
EOF

RUN cat <<'EOF' > /home/strata/.config/pcmanfm-qt/lxqt/settings.conf
[Desktop]
WallpaperMode=color
BgColor=#0d1117
FgColor=#e6edf3
ShadowColor=#000000
Font="DejaVu Sans,10,-1,5,50,0,0,0,0,0"
ShowHidden=false
EOF

RUN cat <<'EOF' > /home/strata/.config/qterminal.org/qterminal.ini
[General]
ApplicationTransparency=0
ColorScheme=DarkPastels
ConfirmMultilinePaste=false
FontFamily=DejaVu Sans Mono
FontSize=10
HistoryLimited=true
HistoryLimitedTo=2000
ScrollbarPosition=2
TerminalMargin=4
TerminalTransparency=0
EOF

# Crisp dark anti-aliased XTerm styling matching StrataOS Debian Crimson theme
RUN cat <<'EOF' > /home/strata/.Xresources
XTerm*termName: xterm-256color
XTerm*faceName: DejaVu Sans Mono
XTerm*faceSize: 10
XTerm*utf8: 1
XTerm*locale: true
XTerm*scrollBar: false
XTerm*saveLines: 4000
XTerm*internalBorder: 12
XTerm*selectToClipboard: true
XTerm*background: #0d1117
XTerm*foreground: #e6edf3
XTerm*cursorColor: #d70a53
XTerm*color0: #0d1117
XTerm*color1: #f85149
XTerm*color2: #3fb950
XTerm*color3: #d29922
XTerm*color4: #58a6ff
XTerm*color5: #d70a53
XTerm*color6: #39c5cf
XTerm*color7: #b1bac4
XTerm*color8: #6e7681
XTerm*color9: #ff7b72
XTerm*color10: #56d364
XTerm*color11: #e3b341
XTerm*color12: #79c0ff
XTerm*color13: #f778ba
XTerm*color14: #56d4dd
XTerm*color15: #f0f6fc
EOF

RUN cat <<'EOF' > /home/strata/.config/openbox/rc.xml
<?xml version="1.0" encoding="UTF-8"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <resistance>
    <strength>10</strength>
    <screen_edge_strength>16</screen_edge_strength>
  </resistance>
  <focus>
    <focusNew>yes</focusNew>
    <followMouse>no</followMouse>
    <focusLast>yes</focusLast>
    <underMouse>no</underMouse>
    <focusDelay>0</focusDelay>
    <raiseOnFocus>no</raiseOnFocus>
  </focus>
  <placement>
    <policy>Smart</policy>
    <center>yes</center>
  </placement>
  <theme>
    <name>Onyx</name>
    <titleLayout>NLIMC</titleLayout>
    <keepBorder>yes</keepBorder>
    <animateIconify>no</animateIconify>
  </theme>
  <desktops>
    <number>3</number>
    <firstdesk>1</firstdesk>
    <popupTime>0</popupTime>
  </desktops>
  <resize>
    <drawContents>no</drawContents>
    <popupShow>Never</popupShow>
  </resize>
  <keyboard>
    <keybind key="A-Tab">
      <action name="NextWindow"/>
    </keybind>
    <keybind key="A-F4">
      <action name="Close"/>
    </keybind>
    <keybind key="C-A-t">
      <action name="Execute">
        <command>xterm -title "StrataOS — Debian 12 Bookworm" -e /bin/bash -lc "stratafetch; exec /bin/bash -i"</command>
      </action>
    </keybind>
  </keyboard>
</openbox_config>
EOF

# Configure /home/strata/.xinitrc: Openbox + LXQt-panel + PCManFM-Qt desktop (zero heavy compositor)
RUN cat <<'EOF' > /home/strata/.xinitrc
#!/bin/bash
export HOME=/home/strata
export USER=strata
export SHELL=/bin/bash
export TERM=xterm-256color
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/runtime-strata}"
mkdir -p "$XDG_RUNTIME_DIR" && chmod 700 "$XDG_RUNTIME_DIR"

export XDG_CURRENT_DESKTOP=LXQt
export FONTCONFIG_FILE=/etc/fonts/strata-fonts.conf
export DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/no-dbus
export QT_QPA_PLATFORM=xcb
export QT_QPA_PLATFORMTHEME=lxqt
export QT_STYLE_OVERRIDE=Fusion
export QT_XCB_GL_INTEGRATION=none
export QT_X11_NO_MITSHM=1
export LIBGL_ALWAYS_SOFTWARE=0

xsetroot -solid "#0d1117" 2>/dev/null || true
xrdb -merge /home/strata/.Xresources 2>/dev/null || true

openbox &
sleep 1

lxqt-panel &
sleep 2

xterm -geometry 86x24+220+130 -title "StrataOS — Debian 12 Bookworm" -e /bin/bash -lc "stratafetch; exec /bin/bash -i" &
sleep 1

exec pcmanfm-qt --desktop
EOF
RUN chmod +x /home/strata/.xinitrc

RUN cat <<'EOF' > /home/strata/.bashrc
export PS1='\[\033[1;35m\]\u@strataos\[\033[0m\]:\[\033[1;36m\]\w\[\033[0m\]\$ '
export TERM=xterm-256color
alias ll='ls -la --color=auto'
alias ls='ls --color=auto'
EOF

RUN chown -R strata:strata /home/strata

WORKDIR /home/strata
CMD ["/bin/bash"]
