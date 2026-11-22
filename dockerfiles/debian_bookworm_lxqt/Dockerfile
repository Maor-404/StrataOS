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
    x11-xserver-utils \
    xinit \
    xorg \
    xserver-xorg-input-evdev \
    xserver-xorg-input-libinput \
    xserver-xorg-legacy \
    xserver-xorg-video-fbdev \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Ensure D-Bus machine-id and X11 non-root permissions for CheerpX
RUN mkdir -p /var/lib/dbus /etc/X11 /tmp/.X11-unix /var/log \
 && dbus-uuidgen > /etc/machine-id \
 && ln -sf /etc/machine-id /var/lib/dbus/machine-id \
 && chmod 1777 /tmp /tmp/.X11-unix \
 && printf 'allowed_users=anybody\nneeds_root_rights=yes\n' > /etc/X11/Xwrapper.config \
 && if [ -f /usr/lib/xorg/Xorg ]; then chmod u+s /usr/lib/xorg/Xorg; fi

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
printf "\033[0;90m  Try: neofetch | htop | qterminal & | pcmanfm-qt & | sudo apt update\033[0m\n"
EOF
RUN chmod +x /usr/local/bin/stratafetch

# Pre-configure dark LXQt + Openbox + PCManFM-Qt + QTerminal profile (zero compositor lag)
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
apps\1\desktop=/usr/share/applications/qterminal.desktop
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
type=lined

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
        <command>qterminal</command>
      </action>
    </keybind>
  </keyboard>
</openbox_config>
EOF

# Configure /home/strata/.xinitrc: Openbox + LXQt-panel + PCManFM-Qt desktop (zero heavy compositor)
RUN cat <<'EOF' > /home/strata/.xinitrc
#!/bin/bash
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/runtime-strata}"
mkdir -p "$XDG_RUNTIME_DIR" && chmod 700 "$XDG_RUNTIME_DIR"

export XDG_CURRENT_DESKTOP=LXQt
export QT_QPA_PLATFORMTHEME=lxqt
export QT_STYLE_OVERRIDE=Fusion

if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ] && command -v dbus-launch >/dev/null 2>&1; then
  eval "$(dbus-launch --sh-syntax --exit-with-session)"
fi

xsetroot -solid "#0d1117" 2>/dev/null || true

openbox &
lxqt-panel &
(sleep 1.2 && qterminal -e bash -lc "stratafetch; exec bash") &

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
