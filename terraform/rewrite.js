// CloudFront Function (viewer request) for the site's static files.
//   /e/<code>/<hunt>/          -> /event/view/index.html   (the hunt's front page; the page reads the code and name from the address)
//   /e/<code>/<hunt>/play/     -> /event/play/index.html
//   /e/<code>/<hunt>/results/  -> /event/results/index.html
//   /e/<code>/<hunt>           -> redirect to /e/<code>/<hunt>/
//   /admin  /admin/x      -> redirect to add the trailing slash; folders serve their index.html
// /api/* and /assets/* never reach this function. tests/unit/rewrite.test.js runs this very file.
function redirect(location) {
  return { statusCode: 301, statusDescription: 'Moved Permanently', headers: { location: { value: location } } };
}

function handler(event) {
  var request = event.request;
  var uri = request.uri;

  var hunt = /^\/e\/([a-z2-9]{4})\/([a-z0-9-]{3,40})(\/(?:(play|results)\/)?)?$/.exec(uri);
  if (hunt) {
    if (hunt[3] === undefined) {
      var query = request.querystring ? Object.keys(request.querystring).map(function (k) { return k + '=' + request.querystring[k].value; }).join('&') : '';
      return redirect('/e/' + hunt[1] + '/' + hunt[2] + '/' + (query ? '?' + query : ''));
    }
    request.uri = '/event/' + (hunt[4] || 'view') + '/index.html';
    return request;
  }
  var deeper = /^\/e\/([a-z2-9]{4})\/([a-z0-9-]{3,40})\/(play|results)$/.exec(uri);
  if (deeper) return redirect('/e/' + deeper[1] + '/' + deeper[2] + '/' + deeper[3] + '/');

  if (uri.charAt(uri.length - 1) === '/') {
    request.uri = uri + 'index.html';
  } else if (uri.lastIndexOf('.') < uri.lastIndexOf('/')) {
    return redirect(uri + '/');
  }
  return request;
}
