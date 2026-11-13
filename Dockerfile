# Статический сайт мастер-класса: nginx + готовые файлы
FROM nginx:1.27-alpine

# Свой конфиг: gzip, кэширование, запрет листинга каталогов
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Только то, что нужно браузеру
COPY index.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY assets/ /usr/share/nginx/html/assets/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
