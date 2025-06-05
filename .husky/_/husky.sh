#!/bin/sh
if [ -z "$husky_skip_init" ]; then
  debug() {
    [ "${HUSKY_DEBUG:-""}" = "" ] || echo "husky (debug) - $*" >&2
  }
  readonly hook_name="$(basename "$0")"
  debug "starting $hook_name..."
  if [ "$HUSKY" = "0" ]; then
    debug "HUSKY env variable is set to 0, skipping hook";
    exit 0
  fi
  if [ -f ~/.huskyrc ]; then
    debug "~/.huskyrc found, sourcing..."
    . ~/.huskyrc
  fi
  export readonly husky_skip_init=1
  sh -e "$0" "$@"
  exit $?
fi
